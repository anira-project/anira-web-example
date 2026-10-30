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
import { BATCHED_WINDOWS_PROCESSOR } from './batched-windows-processor'
// The same module for the audio worklet, bundled by Vite into one self-contained ES module.
import processorModule from './batched-windows-processor.ts?worker&url'
import { logPlans, openAnira, remeasure } from '../utils/anira'

/**
 * The demo's anira chain: the GuitarLSTM hybrid LSTM/dense network on the built-in ONNX Runtime
 * engine, mono. Its input is a batch of 512 context windows of 150 samples (149 past, 1 new
 * each). The model config declares the hop and the history: a window of 661 samples with an
 * overlap of 149, so each inference takes 512 new samples and yields 512. The unfolding of
 * that window into the batch is a JavaScript processor in the audio worklet
 * (batched-windows-processor.ts): the default pre-processing fills a tensor with one contiguous
 * window. Loading needs no audio; `start` builds the chain on a running context up to the
 * handler's audio node. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadGuitarLstm() {
  const { anira, own, teardown } = await openAnira()
  const site = new URL(import.meta.env.BASE_URL, location.href)

  // The context; the model's axes, window and overlap (public/guitar-lstm.model.json); the Hard
  // contract: 34.8 ms per inference, three hops of 512 samples at 44.1 kHz, and 2 warm-up runs.
  // The model has no state, so the pool runs consecutive inferences side by side and a budget
  // longer than a hop costs latency, not throughput; it covers an inference on a slow core
  // (about 18 ms at this batch on an efficiency core of Apple silicon, about 6 on a performance
  // one).
  const context = own(Context.create(anira))
  const model = own(
    await ModelConfig.fromUrl(anira, new URL('guitar-lstm.model.json', site))
  )
  const contract = own(
    await ContractHandle.fromUrl(anira, new URL('guitar-lstm.contract.json', site))
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // One render quantum per call, blocks up to the burst the context renders back to back.
    const g = await measureRenderGeometry(audioContext)
    contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)

    // The processor: its pre_process crosses into the worklet, prepare and unprepare into this
    // thread.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addProcessor(BATCHED_WINDOWS_PROCESSOR, {
        phases:
          ANIRA_EM_PROCESSOR_HOOK_PRE |
          ANIRA_EM_PROCESSOR_HOOK_PREPARE |
          ANIRA_EM_PROCESSOR_HOOK_UNPREPARE,
      })
    const handler = own(InferenceHandler.create(context, pipeline))
    logPlans(handler.prepare(contract))
    pipeline.destroy()

    // The node: mono in and out, the processor's module loaded into the worklet first. An
    // offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = own(
      await handler.createAudioNode(audioContext, {
        waitMs,
        workletModules: [processorModule],
      })
    )
    return {
      audioNode,
      getLatency: () => handler.getLatency(),
      remeasure: () => remeasure(audioContext, contract, [audioNode]),
      teardown,
    }
  }
  return { anira, context, start }
}
