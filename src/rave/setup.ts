import {
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  ONNXRUNTIME_WEB_ENGINE_ID, // from the root entry: naming the engine bundles no onnxruntime-web
  Pipeline,
  anira_engine,
  anira_rt_verdict,
  anira_warmup_outcome,
  measureRenderGeometry,
  type PlanReport,
} from '@anira-project/anira'
// The context's worker module (the ONNX Runtime Web engine with two threads per inference),
// bundled by Vite into one self-contained ES module.
import workerModule from './worker.ts?worker&url'

/**
 * The demo's anira chain: a streaming RAVE model (the magnetic resonator piano model of anira's
 * realtime inference workshop), mono, 2048 samples per inference at 44.1 kHz. The model is
 * stateful: every convolution cache is one flat tensor that each inference takes in and gives
 * back. The model config declares that pair (`state_in` fed from `state_out`), so anira carries
 * the state from one inference to the next, starts a new stream from zeros and runs the
 * handler's inferences one at a time. One inference on one thread takes most of the 46.4 ms a
 * block lasts, so the model runs on the ONNX Runtime Web engine with two threads per inference
 * (worker.ts), defined in the context's worker module. The output also carries the network's
 * own delay, 2224 samples, which the handler's latency includes.
 * Loading needs no audio; `start` builds the chain on a running context (a live one is
 * measured) up to the handler's audio node, which the page connects. `waitMs` lets each quantum
 * wait for its inference (an offline render).
 */
export async function loadRave() {
  // The module on this thread. Its shared WebAssembly memory starts at 256 MiB and grows as the
  // models need (Anira.create's `memory` option sizes it).
  const anira = await Anira.create()
  // Its log, to the console. The web has no log drain thread: the pump delivers the records the
  // real-time threads queue.
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // The context: one inference thread (a Wasm Worker) that imports the worker module. The state
  // makes each inference wait for the one before it, so a larger pool would only start more
  // runtimes that wait; the second core comes from the engine's own thread.
  const context = Context.create(anira, { threads: 1, workerModule })

  // The model config: the tensors, the state pair, the model's own latency and one instance (each
  // would hold its own copy of the 126 MB model) (public/rave.model.json). The page fetches no
  // model file (fetchModel): the engine fetches rave.onnx itself in its init and warms up there
  // (worker.ts). The Hard contract: 46.4 ms per inference (2048 samples at 44.1 kHz, the
  // real-time threshold), no warm-up by anira ("none": the engine warms itself up), and a block
  // that misses plays the input instead (bypass) (public/rave.contract.json).
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(anira, new URL('rave.model.json', site), {
    fetchModel: () => false,
  })
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('rave.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // The host blocks: one render quantum per process call, and blocks up to the burst a live
    // context renders back to back (a device callback's worth of quanta), measured on the
    // running context. The contract gets them, so the latency the handler reports covers a burst.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardHostBlocks(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // The pipeline: the one inference stage and the engine the model config names (defined in
    // the worker module).
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addEngine(ONNXRUNTIME_WEB_ENGINE_ID)
    const handler = InferenceHandler.create(context, pipeline)
    pipeline.destroy() // the handler copied it

    // The contract's warm-up runs at prepare, on the inference thread, and measures the budget
    // there: the Worker starts with the context, runs its engine's init (the session is created
    // there) and enters its loop once this thread yields, so wait for it before the prepare. The
    // init downloads the 126 MB model on a first visit, longer than ready()'s default 10 s on
    // most connections, so the wait allows 10 minutes.
    await context.ready(10 * 60 * 1000)
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
          `plan: ${engine}, budget ${plan.budgetMs.toPrecision(3)} ms (measured ` +
            `${plan.measuredMs.toPrecision(3)} ms, median ${plan.medianMs.toPrecision(3)} ms, ` +
            `${plan.warmupIterations} warm-up inferences, ${outcome}), real-time factor ` +
            `${plan.rtFactor.toPrecision(3)} of ${plan.rtParallel} (load ` +
            `${(plan.rtFactor / plan.rtParallel).toPrecision(3)}): ${verdict}`
        )
      }
    }
    logPlans(handler.prepare(contract))
    // The latency: how many samples later the output answers the input.
    console.log(`latency: ${handler.getLatency()} samples`)

    // The audio node: a Web Audio input and output per Streamed slot of the model (mono in and
    // out).
    const audioNode = await handler.createAudioNode(audioContext, {
      waitMs,
    })

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
        `re-prepared: ${again.numPlans()} plan(s), budget ${plan.budgetMs.toPrecision(3)} ms, ` +
          `real-time factor ${plan.rtFactor.toPrecision(3)} of ${plan.rtParallel}: ${verdict}, ` +
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
