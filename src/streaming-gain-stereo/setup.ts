import {
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
import { QUANTUM, renderBurst } from '../utils/renderBurst'

export type StreamingGainStereo = {
  anira: Anira
  context: Context
  /** Streams the stereo audio: input slot 0 in, output slot 0 out. */
  audioNode: AniraAudioNode
  /**
   * Streams the gain, one value per sample: input slot 1 in, output slot 1 (the model's copy
   * of the gain) out. Connect a signal into it and its output somewhere it is pulled.
   */
  gainNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  latency: number
  teardown: () => void
}

/**
 * The demo's anira chain on `audioContext`, up to its two audio nodes: a stereo gain model whose
 * gain is a second Streamed input, a value per sample, on the built-in ONNX Runtime engine. An
 * audio node feeds one Streamed input and plays one Streamed output, so the handler gets one node
 * per stream; both render on the context's audio thread, the handler's one driver thread.
 * `waitMs` lets each quantum wait for its inference (an offline render).
 *
 * TODO(anira#213): one node over both Streamed inputs (anira_handler_process_multi) once the
 * audio node takes several slots; two nodes on one handler work, but no guide shows them.
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
  ).setGeometry(QUANTUM, renderBurst(audioContext), audioContext.sampleRate)

  // 4. The pipeline and the handler.
  const pipeline = Pipeline.create(anira).addInference(model)
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy()
  contract.destroy()
  const latency = handler.latency()
  console.log(`latency: ${latency} samples`)

  // 5. The audio nodes: one per stream, each on its slots.
  const audioNode = await handler.createAudioNode(audioContext, {
    inputChannels: 2,
    outputChannels: 2,
    waitMs,
  })
  const gainNode = await handler.createAudioNode(audioContext, {
    inputChannels: 1,
    outputChannels: 1,
    inputSlot: 1,
    outputSlot: 1,
    waitMs,
  })

  // 6. The teardown, in reverse: the nodes stop calling the handler first.
  const teardown = () => {
    for (const node of [audioNode, gainNode]) {
      node.node.disconnect()
      node.destroy()
    }
    handler.destroy()
    model.destroy()
    context.destroy()
    stopLogPump()
  }
  return { anira, context, audioNode, gainNode, latency, teardown }
}
