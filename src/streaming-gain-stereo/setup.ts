import {
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import { logPlans, openAnira, remeasure } from '../utils/anira'

/**
 * The demo's anira chain: a stereo gain model whose gain is a second Streamed input, a value per
 * sample, on the built-in ONNX Runtime engine. The node serves every Streamed slot of the model,
 * one Web Audio input and output per slot (input 0 the stereo audio, input 1 the gain; output 0
 * the processed audio, output 1 the model's copy of the gain), and hands them to the handler
 * together each quantum. Loading needs no audio; `start` builds the chain on a running context
 * up to the handler's audio node. `waitMs` lets each quantum wait for its inference (an offline
 * render).
 */
export async function loadStreamingGainStereo() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context; two Streamed inputs (audio, 2 channels; gain, 1 channel) and their two outputs,
  // windows of 512; the contract's miss policy is zeros (a bypass needs every output to have the
  // anchored input's channels, and gain_out has one).
  const context = own(Context.create(anira))
  const model = own(
    await ModelConfig.fromUrl(anira, new URL('streaming-gain-stereo.model.json', site))
  )
  const contract = own(
    await ContractHandle.fromUrl(
      anira,
      new URL('streaming-gain-stereo.contract.json', site)
    )
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // One render quantum per call, blocks up to the burst the context renders back to back.
    const g = await measureRenderGeometry(audioContext)
    contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)

    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = own(InferenceHandler.create(context, pipeline))
    logPlans(handler.prepare(contract))
    pipeline.destroy()

    // The node: two inputs and two outputs, one per Streamed slot, the slots' channels. An
    // offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
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
