import {
  ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
// The engine's id from the worker module, which itself runs in each inference Worker.
import { PASSTHROUGH_ENGINE } from './worker'
import workerModule from './worker.ts?worker&url'
import { logPlans, openAnira, remeasure } from '../utils/anira'

/**
 * The demo's anira chain: the stereo tensors of Simple Gain Stereo, run by a JavaScript engine
 * (worker.ts) that passes its inputs through, with no model file.
 * Loading needs no audio; `start` builds the chain on a running context up to the handler's
 * audio node. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadJsCallback() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context without a pool: the page starts and stops its own inference threads
  // (InferenceThreads), each a Wasm Worker that imports the worker module, where the engine is
  // defined.
  const context = own(Context.create(anira, { threads: 0, workerModule }))
  // The model entry names the engine and no model file, legal for an engine that declares
  // ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL; the contract is Simple Gain Stereo's.
  const model = own(
    await ModelConfig.fromUrl(anira, new URL('passthrough-stereo.model.json', site))
  )
  const contract = own(
    await ContractHandle.fromUrl(anira, new URL('simple-gain-stereo.contract.json', site))
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // One render quantum per call, blocks up to the burst the context renders back to back.
    const g = await measureRenderGeometry(audioContext)
    contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)

    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addEngine(PASSTHROUGH_ENGINE, { flags: ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL })
    const handler = own(InferenceHandler.create(context, pipeline))
    logPlans(handler.prepare(contract))
    pipeline.destroy()

    // The node: stereo in and out.
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
