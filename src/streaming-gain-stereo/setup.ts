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

export type StreamingGainStereo = {
  anira: Anira
  context: Context
  /**
   * Streams both: input 0 the stereo audio (slot 0), input 1 the gain, one value per sample
   * (slot 1); output 0 the processed audio, output 1 the model's copy of the gain.
   */
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  latency: number
  teardown: () => void
}

/**
 * The demo's anira chain on `audioContext`, up to the handler's audio node: a stereo gain model
 * whose gain is a second Streamed input, a value per sample, on the built-in ONNX Runtime
 * engine. The node serves every Streamed slot of the model, one Web Audio input and output per
 * slot, and hands them to the handler together each quantum. `waitMs` lets each quantum wait
 * for its inference (an offline render).
 */
export async function createStreamingGainStereo(
  audioContext: BaseAudioContext,
  { waitMs = 0 } = {}
): Promise<StreamingGainStereo> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context without a pool: the page starts and stops the inference threads itself.
  const context = Context.create(anira, { threads: 0 })

  // 3. The configs: two Streamed inputs (audio, 2 channels; gain, 1 channel) and their two
  //    outputs, windows of 512. The contract's miss policy is zeros: a bypass needs every
  //    output to have the anchored input's channels, and gain_out has one.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('streaming-gain-stereo.model.json', site)
  )
  const contract = (
    await Contract.fromUrl(anira, new URL('streaming-gain-stereo.contract.json', site))
  ).setGeometry(QUANTUM, renderBurstFrames(audioContext), audioContext.sampleRate)

  // 4. The pipeline and the handler.
  const pipeline = Pipeline.create(anira).addInference(model)
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy()
  contract.destroy()
  const latency = handler.latency()
  console.log(`latency: ${latency} samples`)

  // 5. The audio node: two inputs and two outputs, one per Streamed slot, the slots' channels.
  const audioNode = await handler.createAudioNode(audioContext, { waitMs })

  // 6. The teardown, in reverse: the node stops calling the handler first.
  const teardown = () => {
    audioNode.node.disconnect()
    audioNode.destroy()
    handler.destroy()
    model.destroy()
    context.destroy()
    stopLogPump()
  }
  return { anira, context, audioNode, latency, teardown }
}
