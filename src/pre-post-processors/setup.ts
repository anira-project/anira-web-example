import {
  ANIRA_EM_PROCESSOR_HOOK_PRE,
  ANIRA_EM_PROCESSOR_HOOK_PREPARE,
  ANIRA_EM_PROCESSOR_HOOK_UNPREPARE,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
// The processor's module on this thread too: its prepare and unprepare run here.
import { GAIN_CLAMP_PROCESSOR, GAIN_SLOT } from './gain-clamp-processor'
// The same module for the audio worklet, bundled by Vite into one self-contained ES module.
import processorModule from './gain-clamp-processor.ts?worker&url'
import { logPlans, openAnira, remeasure } from '../utils/anira'

/**
 * The demo's anira chain: Simple Gain Stereo's model and contract on the built-in ONNX Runtime
 * engine, with a JavaScript processor (gain-clamp-processor.ts) whose pre_process clamps the
 * Static gain to at most 1.0, in the audio worklet. Loading needs no audio; `start` builds the
 * chain on a running context up to the handler's audio node. `waitMs` lets each quantum wait for
 * its inference (an offline render).
 */
export async function loadGainClamp() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context, and the configs of Simple Gain Stereo, unchanged.
  const context = own(Context.create(anira))
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

    // The processor, under the name its module defines it by: its pre_process crosses into the
    // worklet, prepare and unprepare into this thread. It states
    // ANIRA_PROCESSOR_FLAG_REALTIME_PRE_POST (the default), which a Hard contract requires.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addProcessor(GAIN_CLAMP_PROCESSOR, {
        phases:
          ANIRA_EM_PROCESSOR_HOOK_PRE |
          ANIRA_EM_PROCESSOR_HOOK_PREPARE |
          ANIRA_EM_PROCESSOR_HOOK_UNPREPARE,
      })
    const handler = own(InferenceHandler.create(context, pipeline))
    logPlans(handler.prepare(contract))
    pipeline.destroy()

    // The node: the processor's module loaded into the worklet first, the gain an AudioParam.
    // An offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = own(
      await handler.createAudioNode(audioContext, {
        params: [GAIN_SLOT],
        waitMs,
        workletModules: [processorModule],
      })
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
