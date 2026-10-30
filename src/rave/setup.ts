import {
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  ONNXRUNTIME_WEB_ENGINE_ID, // from the root entry: naming the engine bundles no onnxruntime-web
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
// The context's worker module (the ONNX Runtime Web engine with two threads per inference),
// bundled by Vite into one self-contained ES module.
import workerModule from './worker.ts?worker&url'
import { logPlans, openAnira, remeasure } from '../utils/anira'

/**
 * The demo's anira chain: a streaming RAVE model (the magnetic resonator piano model of anira's
 * realtime inference workshop), mono, 2048 samples per inference at 44.1 kHz. The model is
 * stateful: every convolution cache is one flat tensor that each inference takes in and gives
 * back. The model config declares that pair (`state_in` fed from `state_out`), so anira carries
 * the state from one inference to the next, starts a new stream from zeros and runs the
 * handler's inferences one at a time. One inference on one thread takes most of the 46.4 ms a
 * block lasts, so the model runs on the ONNX Runtime Web engine with two threads per inference
 * (worker.ts), defined in the context's worker module. The output also carries the network's
 * own delay, 2224 samples, which the handler's latency includes. Loading needs no audio; `start`
 * builds the chain on a running context up to the handler's audio node. `waitMs` lets each
 * quantum wait for its inference (an offline render).
 */
export async function loadRave() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context: one inference thread (a Wasm Worker) that imports the worker module. The state
  // makes each inference wait for the one before it, so a larger pool would only start more
  // runtimes that wait; the second core comes from the engine's own thread.
  const context = own(Context.create(anira, { threads: 1, workerModule }))
  // The tensors, the state pair, the model's own latency and one instance (each would hold its
  // own copy of the 126 MB model) (public/rave.model.json). The page fetches no model file
  // (fetchModel): the engine fetches rave.onnx itself in its init and warms up there
  // (worker.ts). The Hard contract: 46.4 ms per inference (2048 samples at 44.1 kHz, the
  // real-time threshold), no warm-up by anira ("none": the engine warms itself up), and a block
  // that misses plays the input instead (bypass) (public/rave.contract.json).
  const model = own(
    await ModelConfig.fromUrl(anira, new URL('rave.model.json', site), {
      fetchModel: () => false,
    })
  )
  const contract = own(
    await ContractHandle.fromUrl(anira, new URL('rave.contract.json', site))
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // One render quantum per call, blocks up to the burst the context renders back to back.
    const g = await measureRenderGeometry(audioContext)
    contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)

    // The one inference stage and the engine the model config names (defined in the worker
    // module).
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addEngine(ONNXRUNTIME_WEB_ENGINE_ID)
    const handler = own(InferenceHandler.create(context, pipeline))
    logPlans(handler.prepare(contract))
    pipeline.destroy()

    // The node: mono in and out, once the inference Worker is in its loop, its engine's session
    // created and warmed up, so the stream's first blocks do not wait for them.
    await context.ready()
    const audioNode = own(await handler.createAudioNode(audioContext, { waitMs }))
    return {
      audioNode,
      getLatency: () => handler.getLatency(),
      remeasure: () => remeasure(audioContext, contract, [audioNode]),
      teardown,
    }
  }
  return { anira, context, start }
}
