import {
  ANIRA_EM_HOOK_PRE,
  ANIRA_EM_HOOK_PREPARE,
  ANIRA_EM_HOOK_UNPREPARE,
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
// The stage's module on this thread too: its prepare and unprepare run here.
import { BATCHED_WINDOWS_STAGE } from './batched-windows-stage'
// The same module for the audio worklet, bundled by Vite into one self-contained ES module.
import stageModule from './batched-windows-stage.ts?worker&url'

/** The chain on a running context: what `start` returns. */
export type GuitarLstmChain = {
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  latency: () => number
  /** Measure the context's render geometry again and re-prepare the running node. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the chain on a context. */
export type GuitarLstm = {
  anira: Anira
  context: Context
  start: (
    audioContext: BaseAudioContext,
    options?: { waitMs?: number }
  ) => Promise<GuitarLstmChain>
}

/**
 * The demo's anira chain: the GuitarLSTM hybrid LSTM/dense network on the built-in ONNX Runtime
 * engine, mono. Its input is a batch of 512 context windows of 150 samples (149 past, 1 new
 * each). The model config declares the hop and the history: a window of 661 samples with an
 * overlap of 149, so each inference takes 512 new samples and yields 512. The unfolding of
 * that window into the batch is a JavaScript stage in the audio worklet
 * (batched-windows-stage.ts): the default pre-processing fills a tensor with one contiguous
 * window. Loading needs no audio; `start` needs a running context (a live one is measured:
 * `await audioContext.resume()` first) and builds the chain up to the handler's audio node.
 * `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadGuitarLstm(): Promise<GuitarLstm> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context with the default pool of inference threads (Wasm Workers). The built-in
  //    engine needs no worker module.
  const context = Context.create(anira)

  // 3. The configs: the model's axes, window and overlap (public/guitar-lstm.model.json), and
  //    the Hard contract: 34.8 ms per inference, three hops of 512 samples at 44.1 kHz, and 2
  //    warm-up runs. The model has no state, so the pool runs consecutive inferences side by
  //    side and a budget longer than a hop costs latency, not throughput; it covers an
  //    inference on a slow core (about 18 ms at this batch on an efficiency core of Apple
  //    silicon, about 6 on a performance one).
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(anira, new URL('guitar-lstm.model.json', site))
  const contract = await Contract.fromUrl(
    anira,
    new URL('guitar-lstm.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // 4. The geometry, measured on the running context: one render quantum per call, blocks up
    //    to the burst it renders back to back, so the latency the handler reports covers it.
    const geometry = await measureRenderGeometry(audioContext)
    contract.setGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // 5. The pipeline with the stage, whose pre_process crosses into the worklet, prepare and
    //    unprepare into this thread; then the handler.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addStage(BATCHED_WINDOWS_STAGE, {
        hooks: ANIRA_EM_HOOK_PRE | ANIRA_EM_HOOK_PREPARE | ANIRA_EM_HOOK_UNPREPARE,
      })
    const handler = Handler.create(context, pipeline).prepare(contract)
    pipeline.destroy()
    console.log(`latency: ${handler.latency()} samples`)

    // 6. The audio node: mono in and out, the stage's module loaded into the worklet first. An
    //    offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = await handler.createAudioNode(audioContext, {
      waitMs,
      workletModules: [stageModule],
    })

    // 7. After an output-device change: measure again, holding the running node meanwhile
    //    (silent, so its rendering does not hide the device's callbacks from the probe), and
    //    re-prepare it for the new geometry (it holds off while the handler re-prepares).
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.setGeometry(g.quantum, g.burst, audioContext.sampleRate)
      audioNode.prepare(contract)
      console.log(`latency: ${handler.latency()} samples`)
    }

    // 8. The teardown, in reverse: the node stops calling the handler first.
    const teardown = () => {
      audioNode.node.disconnect()
      audioNode.destroy()
      handler.destroy()
      contract.destroy()
      model.destroy()
      context.destroy()
      stopLogPump()
    }
    return { audioNode, latency: () => handler.latency(), remeasure, teardown }
  }
  return { anira, context, start }
}
