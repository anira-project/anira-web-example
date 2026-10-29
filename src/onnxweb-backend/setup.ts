import {
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
  renderBurstFrames,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
// The engine's id from the root entry: naming the engine bundles no onnxruntime-web here.
import { ONNXRUNTIME_WEB_ENGINE_ID } from '@anira-project/anira'
// The worker module, bundled by Vite into one self-contained ES module; its URL.
import workerModule from './worker.ts?worker&url'

/** The render quantum: one handler call per quantum. */
const QUANTUM = 128

/** The model's Static input `gain`: input slot 1 of the model config. */
export const GAIN_SLOT = 1

export type OnnxRuntimeWebBackend = {
  anira: Anira
  context: Context
  audioNode: AniraAudioNode
  /** The gain's AudioParam: set, ramp or automate it. */
  gain: AudioParam
  /** The handler's latency in samples: the output is the input this much later. */
  latency: number
  teardown: () => void
}

/**
 * The demo's anira chain on `audioContext`, up to the handler's audio node: the stereo gain
 * model of Simple Gain Stereo, run by the ONNX Runtime Web engine, a JavaScript engine defined
 * in the context's worker module (worker.ts), on each inference Worker. `waitMs` lets each
 * quantum wait for its inference (an offline render).
 */
export async function createOnnxRuntimeWebBackend(
  audioContext: BaseAudioContext,
  { waitMs = 0 } = {}
): Promise<OnnxRuntimeWebBackend> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context with the default pool of inference threads (Wasm Workers), each of which
  //    imports the worker module first: the engine is defined there, not here.
  const context = Context.create(anira, { workerModule })

  // 3. The configs. The model entry names the engine by its id; the engine fetches the .onnx
  //    itself, in each Worker's init, so the loader attaches nothing (fetchModel).
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('simple-gain-stereo-ort-web.model.json', site),
    { fetchModel: () => false }
  )
  const contract = (
    await Contract.fromUrl(anira, new URL('simple-gain-stereo.contract.json', site))
  ).setGeometry(QUANTUM, renderBurstFrames(audioContext), audioContext.sampleRate)

  // 4. The pipeline registers the JavaScript engine under the same id, then the handler.
  const pipeline = Pipeline.create(anira)
    .addInference(model)
    .registerEngine(ONNXRUNTIME_WEB_ENGINE_ID)
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy()
  contract.destroy()
  const latency = handler.latency()
  console.log(`latency: ${latency} samples`)

  // 5. The audio node: stereo in and out, the gain a k-rate AudioParam of the node.
  const audioNode = await handler.createAudioNode(audioContext, {
    params: [GAIN_SLOT],
    waitMs,
  })
  const gain = audioNode.params.get(GAIN_SLOT)!
  gain.value = 1

  // 6. The teardown, in reverse: the node stops calling the handler first.
  const teardown = () => {
    audioNode.node.disconnect()
    audioNode.destroy()
    handler.destroy()
    model.destroy()
    context.destroy()
    stopLogPump()
  }
  return { anira, context, audioNode, gain, latency, teardown }
}
