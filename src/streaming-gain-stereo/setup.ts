import {
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  anira_engine,
  anira_rt_verdict,
  anira_warmup_outcome,
  measureRenderGeometry,
  type PlanReport,
} from '@anira-project/anira'
/**
 * The demo's anira chain: a stereo gain model whose gain is a second Streamed input, a value per
 * sample, on the built-in ONNX Runtime engine.
 * Loading needs no audio; `start` builds the chain on a running context (a live one is
 * measured) up to the handler's audio node, which the page connects. `waitMs` lets each quantum
 * wait for its inference (an offline render).
 */
export async function loadStreamingGainStereo() {
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

  // The model config: two Streamed inputs (audio, 2 channels; gain, 1 channel) and their two
  // outputs, windows of 512. The contract's miss policy is zeros: a bypass needs every output to
  // have the anchored input's channels, and gain_out has one.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('streaming-gain-stereo.model.json', site)
  )
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('streaming-gain-stereo.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // The host blocks: one render quantum per process call, and blocks up to the burst a live
    // context renders back to back (a device callback's worth of quanta), measured on the
    // running context. The contract gets them, so the latency the handler reports covers a burst.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardHostBlocks(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // The pipeline: the one inference stage over the model config.
    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = InferenceHandler.create(context, pipeline)
    pipeline.destroy() // the handler copied it

    // The contract's warm-up runs at prepare, on the inference threads, and measures the budget
    // there: the pool's Workers start with the context, import their module first and enter
    // their loops once this thread yields, so wait for them before the prepare.
    await context.ready()
    console.log(`inference threads: ${context.numInferenceThreads()}`)

    // prepare compiles the plans under the contract, measures each plan's budget with the warm-up
    // pass (an estimate at prepare, on this machine under its load of the moment) and returns
    // the report of them: one plan per model entry the build can run, with its engine (a
    // JavaScript engine by its id, a built-in one by its anira_engine name), its budget, how the
    // pass found it and its real-time factor (the budget over the hop period, of the inferences
    // that may run in parallel). The enums name the outcome and the verdict.
    const logPlans = (report: PlanReport) => {
      for (const plan of report.plans()) {
        const engine =
          plan.engineId ??
          Object.entries(anira_engine).find(([, value]) => value === plan.engine)?.[0]
        const outcome = Object.entries(anira_warmup_outcome).find(
          ([, value]) => value === plan.warmupOutcome
        )?.[0]
        const verdict = Object.entries(anira_rt_verdict).find(
          ([, value]) => value === plan.rtVerdict
        )?.[0]
        console.log(
          `plan: ${engine}, budget ${plan.budgetMs.toFixed(3)} ms (measured ` +
            `${plan.measuredMs.toFixed(3)} ms, median ${plan.medianMs.toFixed(3)} ms, ` +
            `${plan.warmupIterations} warm-up inferences, ${outcome}), real-time factor ` +
            `${plan.rtFactor.toFixed(2)} of ${plan.rtParallel} (load ` +
            `${(plan.rtFactor / plan.rtParallel).toFixed(2)}): ${verdict}`
        )
      }
    }
    logPlans(handler.prepare(contract))
    // The latency: how many samples later the output answers the input.
    console.log(`latency: ${handler.getLatency()} samples`)

    // The audio node serves every Streamed slot, one Web Audio input and output per slot with the
    // slot's channels: input 0 the stereo audio, input 1 the gain stream; output 0 the processed
    // audio, output 1 the model's copy of the gain. It hands them to the handler together each
    // quantum.
    const audioNode = await handler.createAudioNode(audioContext, { waitMs })

    // After an output-device change (the page's sinkchange): measure again with the running node
    // held (silent, so its rendering does not hide the device's callbacks from the probe), give
    // the contract the new host blocks and re-prepare the node, which holds off (silence)
    // while its handler re-prepares.
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.hardHostBlocks(g.quantum, g.burst, audioContext.sampleRate)
      const again = audioNode.prepare(contract) // the report of the new prepare
      logPlans(again)
      // The plan the handler runs: its budget and verdict after the re-prepare.
      const plan = again.plans()[handler.getPlan()]
      const verdict = Object.entries(anira_rt_verdict).find(
        ([, value]) => value === plan.rtVerdict
      )?.[0]
      console.log(
        `re-prepared: ${again.numPlans()} plan(s), budget ${plan.budgetMs.toFixed(3)} ms, ` +
          `real-time factor ${plan.rtFactor.toFixed(2)} of ${plan.rtParallel}: ${verdict}, ` +
          `latency ${handler.getLatency()} samples`
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
      /** The plan report of the handler's last prepare. */
      planReport: () => handler.planReport(),
      remeasure,
      teardown,
    }
  }
  return { anira, context, start }
}
