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
 * The demo's anira chain: the 2-block Steerable-NAFX CNN on the built-in ONNX Runtime engine,
 * mono. Its receptive field is the model config's overlap: each inference takes 1156 samples,
 * the 132 of the previous window and 1024 new ones, and yields 1024. No processor and no worklet
 * module: the windowing that the 2.x demo wrote in JavaScript in its audio worklet is the
 * declared window. Loading needs no audio; `start` builds the chain on a running context up to
 * the handler's audio node. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadSteerableNafx() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context; the model's window and overlap (public/steerable-nafx.model.json); the Hard
  // contract: 23.2 ms per inference (1024 samples at 44.1 kHz, the 2.x real-time threshold),
  // 2 warm-up runs.
  const context = own(Context.create(anira))
  const model = own(
    await ModelConfig.fromUrl(anira, new URL('steerable-nafx.model.json', site))
  )
  const contract = own(
    await ContractHandle.fromUrl(anira, new URL('steerable-nafx.contract.json', site))
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // One render quantum per call, blocks up to the burst the context renders back to back.
    const g = await measureRenderGeometry(audioContext)
    contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)

    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = own(InferenceHandler.create(context, pipeline))
    logPlans(handler.prepare(contract))
    pipeline.destroy()

    // The node: mono in and out. An offline render waits for its inferences: the pool first.
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
