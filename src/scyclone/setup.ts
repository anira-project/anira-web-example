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
 * The demo's anira chain: two RAVE models (funk drums, djembe), each a handler of its own on one
 * context, mono, on the built-in ONNX Runtime engine, up to their two audio nodes (the page
 * builds the mix around them). Both models take and yield blocks of 16384 samples at 48 kHz.
 * Loading needs no audio; `start` builds the two streams on a running context. `waitMs` lets
 * each quantum wait for its inference (an offline render).
 */
export async function loadScyclone() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context: the default pool. Two threads run the two models in parallel; one runs them in
  // turn, which fits the budget where an inference takes under half of it (measured on one
  // thread: about 17 ms per inference in Chromium, 146 ms in Firefox, against 341.3 ms). A
  // slower machine with one thread misses.
  const context = own(Context.create(anira))
  // The configs, one per model, both under the same contract file: 341.3 ms per inference
  // (16384 samples at 48 kHz), 2 warm-up runs.
  const models = [
    own(await ModelConfig.fromUrl(anira, new URL('funk-drums.model.json', site))),
    own(await ModelConfig.fromUrl(anira, new URL('djembe.model.json', site))),
  ]
  const contract = own(
    await ContractHandle.fromUrl(anira, new URL('rave.contract.json', site))
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // One render quantum per call, blocks up to the burst the context renders back to back.
    const g = await measureRenderGeometry(audioContext)
    contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)

    // One handler per model, both prepared under the contract (each copies it).
    const handlers = models.map((model) => {
      const pipeline = Pipeline.create(anira).addInference(model)
      const handler = own(InferenceHandler.create(context, pipeline))
      logPlans(handler.prepare(contract))
      pipeline.destroy()
      return handler
    })

    // Their nodes, mono in and out, created at once. An offline render waits for its
    // inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const [funk, djembe] = await Promise.all(
      handlers.map(async (handler) => ({
        audioNode: own(await handler.createAudioNode(audioContext, { waitMs })),
        getLatency: () => handler.getLatency(),
      }))
    )
    return {
      funk,
      djembe,
      // The dry path waits for the slower of the two.
      getLatency: () => Math.max(funk.getLatency(), djembe.getLatency()),
      remeasure: () =>
        remeasure(audioContext, contract, [funk.audioNode, djembe.audioNode]),
      teardown,
    }
  }
  return { anira, context, start }
}
