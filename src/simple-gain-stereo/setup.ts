import {
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import { logPlans, openAnira, remeasure } from '../utils/anira'

/** The model's Static input `gain`: input slot 1 of the model config. */
export const GAIN_SLOT = 1

/**
 * The demo's anira chain: the model and contract files a native host loads unchanged, run by
 * the module's built-in ONNX Runtime engine. Loading needs no audio; `start` builds the chain on
 * a running context (a live one is measured) up to the handler's audio node, which the page
 * connects. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadSimpleGainStereo() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context: the default pool of inference threads, Wasm Workers.
  const context = own(Context.create(anira))
  // The model config names the .onnx beside it, which fromUrl fetches and attaches; the
  // contract file leaves the geometry to the host.
  const model = own(
    await ModelConfig.fromUrl(anira, new URL('simple-gain-stereo.model.json', site))
  )
  const contract = own(
    await ContractHandle.fromUrl(anira, new URL('simple-gain-stereo.contract.json', site))
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // One render quantum per call, blocks up to the burst the context renders back to back.
    const g = await measureRenderGeometry(audioContext)
    contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)

    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = own(InferenceHandler.create(context, pipeline))
    logPlans(handler.prepare(contract))
    pipeline.destroy() // the handler copied it

    // The node: an input and an output per Streamed slot (stereo), the gain a k-rate
    // AudioParam. An offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = own(
      await handler.createAudioNode(audioContext, { params: [GAIN_SLOT], waitMs })
    )
    const gain = audioNode.params.get(GAIN_SLOT)!
    gain.value = 1
    return {
      audioNode,
      gain,
      getLatency: () => handler.getLatency(),
      remeasure: () => remeasure(audioContext, contract, [audioNode]),
      teardown,
    }
  }
  return { anira, context, start }
}
