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

/** The render quantum: one handler call per quantum. */
const QUANTUM = 128

/** The model's Static input `gain`: input slot 1 of the model config. */
export const GAIN_SLOT = 1

export type SimpleGainStereo = {
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
 * The demo's anira chain on `audioContext`, up to the handler's audio node (the page connects
 * it): the model and contract files a native host loads unchanged, run by the module's built-in
 * ONNX Runtime engine. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function createSimpleGainStereo(
  audioContext: BaseAudioContext,
  { waitMs = 0 } = {}
): Promise<SimpleGainStereo> {
  // 1. The module on this thread (a shared 512 MiB memory) and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump() // the web has no drain thread

  // 2. A context without a pool: the page starts and stops the inference threads itself
  //    (InferenceThreads, the + / − Worker buttons). The built-in engine needs no worker module.
  const context = Context.create(anira, { threads: 0 })

  // 3. The configs: public/simple-gain-stereo.model.json names the .onnx beside it, which
  //    fromUrl fetches and attaches; the contract leaves the geometry to the host: one render
  //    quantum per call, up to the burst a live context renders back to back.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('simple-gain-stereo.model.json', site)
  )
  const contract = (
    await Contract.fromUrl(anira, new URL('simple-gain-stereo.contract.json', site))
  ).setGeometry(QUANTUM, renderBurstFrames(audioContext), audioContext.sampleRate)

  // 4. The pipeline and the handler.
  const pipeline = Pipeline.create(anira).addInference(model)
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy() // the handler copied it
  contract.destroy() // so did the prepare
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
