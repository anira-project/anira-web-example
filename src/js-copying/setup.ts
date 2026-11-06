import {
  ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL,
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
// The engine's id from the worker module, which itself runs in each inference Worker.
import { JS_COPY_ENGINE } from './worker'
import workerModule from './worker.ts?worker&url'

/**
 * The demo's anira chain: the stereo tensors of Simple Gain Stereo, run by a JavaScript engine
 * (JSCopyEngine, defined in worker.ts) that copies its inputs through sample by sample, with no
 * model file.
 * Loading needs no audio; `start` builds the chain on a running context (a live one is
 * measured) up to the handler's audio node, which the page connects. `waitMs` lets each quantum
 * wait for its inference (an offline render).
 */
export async function loadJsCopying() {
  // The module on this thread. Its shared WebAssembly memory starts at 256 MiB and grows as the
  // models need (Anira.create's `memory` option sizes it).
  const anira = await Anira.create()
  // Its log, to the console. The web has no log drain thread: the pump delivers the records the
  // real-time threads queue.
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // The context: the core and its pool of inference threads, Wasm Workers, half the cores by
  // default. Each Worker imports the worker module first: the JavaScript engine is defined
  // there, in the Worker's own realm, not here.
  const context = Context.create(anira, { workerModule })

  // The model entry names the engine and no model file, legal for an engine that declares
  // ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL (start); the contract is Simple Gain Stereo's.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('js-copy-stereo.model.json', site)
  )
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('simple-gain-stereo.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // The host blocks: one render quantum per process call, and blocks up to the burst a live
    // context renders back to back (a device callback's worth of quanta), measured on the
    // running context. The contract gets them, so the latency the handler reports covers a burst.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardHostBlocks(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // The pipeline: the inference stage and the JavaScript engine under its id, which promises
    // to read no model file.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addEngine(JS_COPY_ENGINE, { flags: ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL })
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

    // The audio node: a Web Audio input and output per Streamed slot of the model (stereo).
    const audioNode = await handler.createAudioNode(audioContext, { waitMs })

    // The verdict of the plan the handler runs (its row of the last report): a plan that is not
    // real-time on this machine would drop out, so on a live context the node is held (silent, no
    // inference) until the user agrees (the page's "Try nonetheless", tryNonetheless). An offline
    // render (waitMs > 0) does not run against the clock and is never held. The worst verdict the
    // user accepted is kept: a re-prepare holds the node again only when its verdict is worse.
    const live = waitMs === 0
    let accepted: number = anira_rt_verdict.ANIRA_RT_UNMEASURED
    let held = false
    const applyVerdict = () => {
      const plan = handler.planReport().plans()[handler.getPlan()]
      held =
        live &&
        plan.rtVerdict === anira_rt_verdict.ANIRA_RT_NOT_REALTIME &&
        plan.rtVerdict > accepted
      audioNode.hold(held)
    }
    applyVerdict()
    const tryNonetheless = () => {
      accepted = handler.planReport().plans()[handler.getPlan()].rtVerdict
      held = false
      audioNode.hold(false)
      console.log('tried nonetheless: the node runs, misses are filled by on_miss')
    }

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
      // Held again only when the new verdict is worse than the one the user accepted.
      applyVerdict()
      const acceptedBefore =
        live && !held && plan.rtVerdict === anira_rt_verdict.ANIRA_RT_NOT_REALTIME
      console.log(
        `re-prepared: ${again.numPlans()} plan(s), budget ${plan.budgetMs.toFixed(3)} ms, ` +
          `real-time factor ${plan.rtFactor.toFixed(2)} of ${plan.rtParallel}: ${verdict}, ` +
          `latency ${handler.getLatency()} samples${acceptedBefore ? ' (accepted before)' : ''}`
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
      /** The row of the plan the handler runs, from its last prepare. */
      plan: () => handler.planReport().plans()[handler.getPlan()],
      /** Whether the node is held until the user agrees (tryNonetheless). */
      waitsForConsent: () => held,
      tryNonetheless,
      remeasure,
      teardown,
    }
  }
  return { anira, context, start }
}
