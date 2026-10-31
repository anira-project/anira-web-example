import {
  ANIRA_EM_PROCESSOR_HOOK_PRE,
  ANIRA_EM_PROCESSOR_HOOK_PREPARE,
  ANIRA_EM_PROCESSOR_HOOK_UNPREPARE,
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  anira_engine,
  measureRenderGeometry,
} from '@anira-project/anira'
// The processor's module on this thread too: its prepare and unprepare run here.
import { BATCHED_WINDOWS_PROCESSOR } from './batched-windows-processor'
// The same module for the audio worklet, bundled by Vite into one self-contained ES module.
import processorModule from './batched-windows-processor.ts?worker&url'

/**
 * The demo's anira chain: the GuitarLSTM hybrid LSTM/dense network on the built-in ONNX Runtime
 * engine, mono. Its input is a batch of 512 context windows of 150 samples (149 past, 1 new
 * each). The model config declares the hop and the history: a window of 661 samples with an
 * overlap of 149, so each inference takes 512 new samples and yields 512. The unfolding of
 * that window into the batch is a JavaScript processor in the audio worklet
 * (batched-windows-processor.ts): the default pre-processing fills a tensor with one contiguous
 * window.
 * Loading needs no audio; `start` builds the chain on a running context (a live one is
 * measured) up to the handler's audio node, which the page connects. `waitMs` lets each quantum
 * wait for its inference (an offline render).
 */
export async function loadGuitarLstm() {
  // The module on this thread. Its shared WebAssembly memory starts at 256 MiB and grows as the
  // models need (Anira.create's `memory` option sizes it).
  const anira = await Anira.create()
  // Its log, to the console. The web has no log drain thread: the pump delivers the records the
  // real-time threads queue.
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // The context: the core and its pool of inference threads, Wasm Workers, half the cores by
  // default, as natively. The built-in engine needs no worker module.
  const context = Context.create(anira)

  // The model config declares the axes, the window and the overlap
  // (public/guitar-lstm.model.json); the Hard contract: 34.8 ms per inference, three hops of 512
  // samples at 44.1 kHz, and 2 warm-up runs. The model has no state, so the pool runs
  // consecutive inferences side by side and a budget longer than a hop costs latency, not
  // throughput; it covers an inference on a slow core (about 18 ms at this batch on an
  // efficiency core of Apple silicon, about 6 on a performance one).
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(anira, new URL('guitar-lstm.model.json', site))
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('guitar-lstm.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // The geometry: one render quantum per process call, and blocks up to the burst a live
    // context renders back to back (a device callback's worth of quanta), measured on the
    // running context. The contract gets it, so the latency the handler reports covers a burst.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // The pipeline: the inference stage over the model config, and the JavaScript processor under
    // the name its module defines it by. Its pre_process crosses into the audio worklet, its
    // prepare and unprepare into this thread; it states ANIRA_PROCESSOR_FLAG_REALTIME_PRE_POST
    // (the default), which a Hard contract requires.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addProcessor(BATCHED_WINDOWS_PROCESSOR, {
        phases:
          ANIRA_EM_PROCESSOR_HOOK_PRE |
          ANIRA_EM_PROCESSOR_HOOK_PREPARE |
          ANIRA_EM_PROCESSOR_HOOK_UNPREPARE,
      })
    const handler = InferenceHandler.create(context, pipeline)
    pipeline.destroy() // the handler copied it

    // prepare compiles the plans under the contract and returns the report of them: one plan per
    // model entry the build can run, with its engine (a JavaScript engine by its id, a built-in
    // one by its anira_engine name) and its budget.
    const report = handler.prepare(contract)
    for (const plan of report.plans()) {
      const engine =
        plan.engineId ??
        Object.entries(anira_engine).find(([, value]) => value === plan.engine)?.[0]
      console.log(`plan: ${engine}, ${plan.budgetMs} ms budget`)
    }
    // The latency: how many samples later the output answers the input.
    console.log(`latency: ${handler.getLatency()} samples`)

    // The pool's Workers start once this thread yields and import their module first: an
    // offline render waits for every inference, so they must be in their loops before it; a
    // live stream would only miss its first quanta.
    await context.ready()
    console.log(`inference threads: ${context.numInferenceThreads()}`)

    // The audio node: a Web Audio input and output per Streamed slot of the model (mono in and
    // out). The processor's module is loaded into the worklet
    // before the node.
    const audioNode = await handler.createAudioNode(audioContext, {
      waitMs,
      workletModules: [processorModule],
    })

    // After an output-device change (the page's sinkchange): measure again with the running node
    // held (silent, so its rendering does not hide the device's callbacks from the probe), give
    // the contract the new geometry and re-prepare the node, which holds off (silence) while its
    // handler re-prepares.
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)
      const again = audioNode.prepare(contract) // the report of the new prepare
      console.log(
        `re-prepared: ${again.numPlans()} plan(s), latency ${handler.getLatency()} samples`
      )
    }

    // The teardown, in reverse order of creation: the node stops calling the handler first. C
    // objects are freed by destroy, never by the garbage collector.
    const teardown = () => {
      audioNode.node.disconnect()
      audioNode.destroy()
      handler.destroy()
      contract.destroy()
      model.destroy()
      context.destroy() // the last context stops the pool
      stopLogPump()
    }
    return {
      audioNode,
      getLatency: () => handler.getLatency(),
      remeasure,
      teardown,
    }
  }
  return { anira, context, start }
}
