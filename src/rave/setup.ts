import {
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  ONNXRUNTIME_WEB_ENGINE_ID, // from the root entry: naming the engine bundles no onnxruntime-web
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
// The context's worker module (the ONNX Runtime Web engine with two threads per inference),
// bundled by Vite into one self-contained ES module.
import workerModule from './worker.ts?worker&url'

/** The chain on a running context: what `start` returns. */
export type RaveChain = {
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output answers the input this much later. */
  latency: () => number
  /** Measure the context's render geometry again and re-prepare the running node. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the chain on a context. */
export type Rave = {
  anira: Anira
  context: Context
  start: (audioContext: BaseAudioContext, options?: { waitMs?: number }) => Promise<RaveChain>
}

/**
 * The demo's anira chain: a streaming RAVE model (the magnetic resonator piano model of anira's
 * realtime inference workshop), mono, 2048 samples per inference at 44.1 kHz. The model is
 * stateful: every convolution cache is one flat tensor that each inference takes in and gives
 * back. The model config declares that pair (`state_in` fed from `state_out`), so anira carries
 * the state from one inference to the next, starts a new stream from zeros and runs the
 * handler's inferences one at a time. One inference on one thread takes most of the 46.4 ms a
 * block lasts, so the model runs on the ONNX Runtime Web engine with two threads per inference
 * (worker.ts), defined in the context's worker module. The output also carries the network's
 * own delay, 2224 samples, which the handler's latency includes. Loading needs no audio; `start` needs a running context (a live one is measured:
 * `await audioContext.resume()` first). `waitMs` lets each quantum wait for its inference (an
 * offline render).
 */
export async function loadRave(): Promise<Rave> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context with one inference thread (a Wasm Worker) that imports the worker module. The
  //    state makes each inference wait for the one before it, so a larger pool would only
  //    start more runtimes that wait; the second core comes from the engine's own thread.
  const context = Context.create(anira, { threads: 1, workerModule })

  // 3. The configs: the tensors, the state pair, the model's own latency and one instance
  //    (each would hold its own copy of the 126 MB model) (public/rave.model.json), and the
  //    Hard contract: 46.4 ms per inference (2048 samples at 44.1 kHz, the real-time
  //    threshold), 3 warm-up runs, zeros for a block that misses (public/rave.contract.json).
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(anira, new URL('rave.model.json', site))
  const contract = await Contract.fromUrl(anira, new URL('rave.contract.json', site))

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // 4. The geometry, measured on the running context: one render quantum per call, blocks up
    //    to the burst it renders back to back, so the latency the handler reports covers it.
    const geometry = await measureRenderGeometry(audioContext)
    contract.setGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // 5. The handler over a pipeline with the one inference stage and the engine the model
    //    config names (defined in the worker module), prepared under the contract.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .registerEngine(ONNXRUNTIME_WEB_ENGINE_ID)
    const handler = Handler.create(context, pipeline).prepare(contract)
    pipeline.destroy()
    console.log(`latency: ${handler.latency()} samples`)

    // 6. The audio node: mono in and out. An offline render waits for its inferences: the pool
    //    first.
    if (waitMs > 0) await context.ready()
    const audioNode = await handler.createAudioNode(audioContext, { waitMs })

    // 7. After an output-device change: measure again, holding the running node meanwhile
    //    (silent, so its rendering does not hide the device's callbacks from the probe), and
    //    re-prepare it for the new geometry (it holds off while the handler re-prepares).
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.setGeometry(g.quantum, g.burst, audioContext.sampleRate)
      audioNode.prepare(contract)
      console.log(`latency: ${handler.latency()} samples`)
    }

    // 8. The teardown, in reverse: the node stops calling the handler first.
    const teardown = () => {
      audioNode.node.disconnect()
      audioNode.destroy()
      handler.destroy()
      contract.destroy()
      model.destroy()
      context.destroy()
      stopLogPump()
    }
    return { audioNode, latency: () => handler.latency(), remeasure, teardown }
  }
  return { anira, context, start }
}
