import {
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  ONNXRUNTIME_WEB_ENGINE_ID, // from the root entry: naming the engine bundles no onnxruntime-web
  Pipeline,
  anira_engine,
  measureRenderGeometry,
} from '@anira-project/anira'
// The context's worker module (the ONNX Runtime Web engine with two threads per inference),
// bundled by Vite into one self-contained ES module.
import workerModule from './worker.ts?worker&url'

/**
 * The demo's anira chain: a streaming RAVE model (the magnetic resonator piano model of anira's
 * realtime inference workshop), mono, 2048 samples per inference at 44.1 kHz. The model is
 * stateful: every convolution cache is one flat tensor that each inference takes in and gives
 * back. The model config declares that pair (`state_in` fed from `state_out`), so anira carries
 * the state from one inference to the next, starts a new stream from zeros and runs the
 * handler's inferences one at a time. One inference on one thread takes most of the 46.4 ms a
 * block lasts, so the model runs on the ONNX Runtime Web engine with two threads per inference
 * (worker.ts), defined in the context's worker module. The output also carries the network's
 * own delay, 2224 samples, which the handler's latency includes.
 * Loading needs no audio; `start` builds the chain on a running context (a live one is
 * measured) up to the handler's audio node, which the page connects. `waitMs` lets each quantum
 * wait for its inference (an offline render).
 */
export async function loadRave() {
  // The module on this thread. Its shared WebAssembly memory starts at 256 MiB and grows as the
  // models need (Anira.create's `memory` option sizes it).
  const anira = await Anira.create()
  // Its log, to the console. The web has no log drain thread: the pump delivers the records the
  // real-time threads queue.
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // The context: one inference thread (a Wasm Worker) that imports the worker module. The state
  // makes each inference wait for the one before it, so a larger pool would only start more
  // runtimes that wait; the second core comes from the engine's own thread.
  const context = Context.create(anira, { threads: 1, workerModule })

  // The model config: the tensors, the state pair, the model's own latency and one instance (each
  // would hold its own copy of the 126 MB model) (public/rave.model.json). The page fetches no
  // model file (fetchModel): the engine fetches rave.onnx itself in its init and warms up there
  // (worker.ts). The Hard contract: 46.4 ms per inference (2048 samples at 44.1 kHz, the
  // real-time threshold), no warm-up by anira ("none": the engine warms itself up), and a block
  // that misses plays the input instead (bypass) (public/rave.contract.json).
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(anira, new URL('rave.model.json', site), {
    fetchModel: () => false,
  })
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('rave.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // The geometry: one render quantum per process call, and blocks up to the burst a live
    // context renders back to back (a device callback's worth of quanta), measured on the
    // running context. The contract gets it, so the latency the handler reports covers a burst.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // The pipeline: the one inference stage and the engine the model config names (defined in
    // the worker module).
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addEngine(ONNXRUNTIME_WEB_ENGINE_ID)
    const handler = InferenceHandler.create(context, pipeline)
    pipeline.destroy() // the handler copied it

    // prepare compiles the plans under the contract and returns the report of them: one plan per
    // model entry the build can run, with its engine (a JavaScript engine by its id, a built-in
    // one by its anira_engine name) and its budget.
    const report = handler.prepare(contract)
    for (const plan of report.plans()) {
      const engine =
        plan.engineId ??
        Object.entries(anira_engine).find(([, value]) => value === plan.engine)?.[0]
      console.log(`plan: ${engine}, ${plan.budgetMs} ms budget`)
    }
    // The latency: how many samples later the output answers the input.
    console.log(`latency: ${handler.getLatency()} samples`)

    // The node streams once the inference Worker is in its loop, its engine's session created and
    // warmed up, so the stream's first blocks do not wait for them.
    await context.ready()
    console.log(`inference threads: ${context.numInferenceThreads()}`)

    // The audio node: a Web Audio input and output per Streamed slot of the model (mono in and
    // out).
    const audioNode = await handler.createAudioNode(audioContext, {
      waitMs,
    })

    // After an output-device change (the page's sinkchange): measure again with the running node
    // held (silent, so its rendering does not hide the device's callbacks from the probe), give
    // the contract the new geometry and re-prepare the node, which holds off (silence) while its
    // handler re-prepares.
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)
      const again = audioNode.prepare(contract) // the report of the new prepare
      console.log(
        `re-prepared: ${again.numPlans()} plan(s), latency ${handler.getLatency()} samples`
      )
    }

    // The teardown, in reverse order of creation: the node stops calling the handler first. C
    // objects are freed by destroy, never by the garbage collector.
    const teardown = () => {
      audioNode.node.disconnect()
      audioNode.destroy()
      handler.destroy()
      contract.destroy()
      model.destroy()
      context.destroy() // the last context stops the pool
      stopLogPump()
    }
    return {
      audioNode,
      getLatency: () => handler.getLatency(),
      remeasure,
      teardown,
    }
  }
  return { anira, context, start }
}
