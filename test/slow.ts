// The slow path, through the real API (test/slow.html): a deliberately slow JavaScript engine
// (slow-worker.ts: 0.9 hop periods per call at 48 kHz) on a pool of one Worker, its handler
// prepared on anira's defaults (the measured budget, the until-stable warm-up), the node held
// and released as the demos do it, with the demos' verdict note and button (renderVerdict). No
// hook is added to anira's API or to any demo. Each prepare reuses the model's figure after the
// first, so the verdict moves only through the hop period, here the sample rate:
// 1. a live context at 48 kHz: the load is 0.9 or more, so marginal (the note, no button, the node
//    plays), or not real-time on a slower machine (then the button, clicked);
// 2. the same handler prepared for a live context at 96 kHz: the figure reused (no pass: the
//    engine's call count stays), the load 1.8 or more, not real-time; worse than what was
//    accepted, so the node is held (its output silent) and the button shows; after the click
//    the node plays;
// 3. a sinkchange re-prepare at 96 kHz: reused, still not real-time, not worse than accepted, so
//    no button and the node plays on;
// 4. the same handler rendered offline at 96 kHz: never held; the render completes.
// Only lower bounds the sleeps guarantee are asserted (a slower machine sleeps longer). A browser
// that starts no AudioContext here (headless Firefox) runs step 4 alone. The verdict is
// window.anira_test_result.
import {
  ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL,
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  anira_rt_verdict,
  anira_warmup_outcome,
  measureRenderGeometry,
  type AniraAudioNode,
} from '@anira-project/anira'
import { renderVerdict } from '../src/utils/setupDemoUI'
import { energy, type Checks } from './common'
import { HOP, SLOW_CALLS, SLOW_ENGINE } from './slow-worker'
import workerModule from './slow-worker.ts?worker&url'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Result = { checks: Checks } | { error: string }

declare global {
  interface Window {
    anira_test_result?: Result
  }
}

const streamed = (name: string) => ({
  name,
  dtype: 'float32',
  role: 'streamed',
  axes: [
    ['batch', 1],
    ['channel', 1],
    ['time', HOP],
  ],
  window: { min: HOP, max: HOP },
})

/** A live context at `sampleRate`, running; null when the browser starts none here. */
const liveContext = async (sampleRate: number): Promise<AudioContext | null> => {
  const audioContext = new AudioContext({ sampleRate })
  await Promise.race([audioContext.resume(), delay(2000)])
  if (audioContext.state === 'running') return audioContext
  await audioContext.close()
  return null
}

/** The RMS of what the tap heard last. */
const rmsOf = (tap: AnalyserNode) => {
  const samples = new Float32Array(tap.fftSize)
  tap.getFloatTimeDomainData(samples)
  return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
}

const run = async (): Promise<Result> => {
  const checks: Checks = [
    { ok: crossOriginIsolated, what: 'the page is cross-origin isolated (COOP/COEP)' },
  ]
  const check = (ok: boolean, what: string) => checks.push({ ok, what })
  let calls = 0
  const channel = new BroadcastChannel(SLOW_CALLS)
  channel.onmessage = () => (calls += 1)
  const note = document.getElementById('verdict')!
  const button = document.getElementById('try-nonetheless') as HTMLButtonElement

  const anira = await Anira.create()
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()
  const context = Context.create(anira, { threads: 1, workerModule })
  const model = await ModelConfig.fromJson(
    anira,
    JSON.stringify({
      models: [{ engine: SLOW_ENGINE }],
      inputs: [streamed('audio_in')],
      outputs: [streamed('audio_out')],
    })
  )
  const pipeline = Pipeline.create(anira)
    .addInference(model)
    .addEngine(SLOW_ENGINE, { flags: ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL })
  const handler = InferenceHandler.create(context, pipeline)
  pipeline.destroy()
  // anira's defaults: the budget the warm-up pass measures, until the times are stable.
  const contract = ContractHandle.hard(anira, {
    hostBlockMin: 128,
    hostBlockMax: 128,
    hostRate: 48000,
  })
  await context.ready()

  // The demos' verdict, spelled the same way: on a live context a not real-time plan worse than
  // the accepted verdict holds the node until "Try nonetheless".
  let live = true
  let accepted: number = anira_rt_verdict.ANIRA_RT_UNMEASURED
  let held = false
  let audioNode: AniraAudioNode | null = null
  const plan = () => handler.planReport().plans()[handler.getPlan()]
  const applyVerdict = () => {
    const row = plan()
    held =
      live &&
      row.rtVerdict === anira_rt_verdict.ANIRA_RT_NOT_REALTIME &&
      row.rtVerdict > accepted
    audioNode!.hold(held)
  }
  const demo = { plan, waitsForConsent: () => held }
  button.onclick = () => {
    accepted = plan().rtVerdict
    held = false
    audioNode!.hold(false)
    renderVerdict(demo, note, button)
  }
  const prepareFor = async (audioContext: BaseAudioContext) => {
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardHostBlocks(geometry.quantum, geometry.burst, audioContext.sampleRate)
    await delay(300) // the messages of an inference still in flight from the last step
    const before = calls
    handler.prepare(contract)
    await delay(300) // the engine's messages of the pass, if it ran one
    return calls - before
  }
  // A live chain: a tone into the node, the node's output on a tap.
  const playOn = async (audioContext: AudioContext) => {
    audioNode = await handler.createAudioNode(audioContext, {})
    applyVerdict()
    const tone = new OscillatorNode(audioContext, { frequency: 220 })
    const tap = new AnalyserNode(audioContext, { fftSize: 4096 })
    tone.connect(audioNode.node).connect(tap).connect(audioContext.destination)
    tone.start()
    return tap
  }
  const load = () => plan().rtFactor / plan().rtParallel

  const at48 = await liveContext(48000)
  if (!at48) {
    check(true, 'skipped: the live steps (no AudioContext starts in this browser here)')
  } else {
    // Step 1: 48 kHz, measured now.
    const passCalls = await prepareFor(at48)
    const first = plan()
    check(
      (first.warmupOutcome === anira_warmup_outcome.ANIRA_WARMUP_OUTCOME_STABLE ||
        first.warmupOutcome === anira_warmup_outcome.ANIRA_WARMUP_OUTCOME_CAPPED) &&
        passCalls >= 4 &&
        load() >= 0.9 &&
        first.rtVerdict !== anira_rt_verdict.ANIRA_RT_COMFORTABLE,
      `48 kHz: measured over ${first.warmupIterations} inferences (${passCalls} engine ` +
        `calls), load ${load().toFixed(2)} >= 0.9, verdict ${first.rtVerdict}`
    )
    const tap48 = await playOn(at48)
    renderVerdict(demo, note, button)
    if (first.rtVerdict === anira_rt_verdict.ANIRA_RT_MARGINAL) {
      check(
        !held && !note.hidden && button.hidden,
        `48 kHz marginal: the note shows, no button, the node plays ("${note.textContent}")`
      )
    } else {
      check(
        held && !button.hidden,
        `48 kHz not real-time on this machine: held, the button shows ("${note.textContent}")`
      )
      button.click()
    }
    await delay(1500)
    check(rmsOf(tap48) > 1e-3, `48 kHz: the node plays (RMS ${rmsOf(tap48).toFixed(4)})`)
    audioNode!.destroy()
    await at48.close()

    // Step 2: the same handler for a live context at 96 kHz.
    const at96 = await liveContext(96000)
    if (!at96) {
      check(false, 'a live context at 96 kHz did not start')
    } else {
      const acceptedBefore = accepted
      const reusedCalls = await prepareFor(at96)
      const second = plan()
      check(
        second.warmupOutcome === anira_warmup_outcome.ANIRA_WARMUP_OUTCOME_REUSED &&
          reusedCalls === 0 &&
          load() >= 1.8 &&
          second.rtVerdict === anira_rt_verdict.ANIRA_RT_NOT_REALTIME,
        `96 kHz: the model's figure reused (${reusedCalls} engine calls), load ` +
          `${load().toFixed(2)} >= 1.8, not real-time`
      )
      const tap96 = await playOn(at96)
      renderVerdict(demo, note, button)
      if (acceptedBefore !== anira_rt_verdict.ANIRA_RT_NOT_REALTIME) {
        await delay(1000)
        check(
          held && !button.hidden && rmsOf(tap96) < 1e-6,
          `96 kHz, worse than accepted: held (output RMS ${rmsOf(tap96)}), the button shows ` +
            `("${note.textContent}")`
        )
        button.click()
      } else {
        check(
          !held && button.hidden,
          '96 kHz, not worse than accepted: not held, no button'
        )
      }
      await delay(1500)
      check(
        !held && rmsOf(tap96) > 1e-3,
        `96 kHz after "Try nonetheless": the node plays (RMS ${rmsOf(tap96).toFixed(4)}; the ` +
          'misses filled by on_miss)'
      )

      // Step 3: a sinkchange re-prepare at 96 kHz, as the demos do it.
      const g = await measureRenderGeometry(at96, { hold: [audioNode!] })
      contract.hardHostBlocks(g.quantum, g.burst, at96.sampleRate)
      audioNode!.prepare(contract)
      applyVerdict()
      renderVerdict(demo, note, button)
      await delay(1500)
      check(
        plan().warmupOutcome === anira_warmup_outcome.ANIRA_WARMUP_OUTCOME_REUSED,
        `96 kHz sinkchange: the model's figure reused (outcome ${plan().warmupOutcome})`
      )
      check(
        !held && button.hidden,
        '96 kHz sinkchange: not worse than accepted, not held, no button'
      )
      check(
        rmsOf(tap96) > 1e-3,
        `96 kHz sinkchange: the node plays on (RMS ${rmsOf(tap96).toFixed(4)})`
      )
      audioNode!.destroy()
      await at96.close()
    }
  }

  // Step 4: offline at 96 kHz, never held; the render completes.
  live = false
  const length = 16 * HOP
  const offline = new OfflineAudioContext(1, length, 96000)
  await prepareFor(offline)
  audioNode = await handler.createAudioNode(offline, { waitMs: 1000 })
  applyVerdict()
  const tone = new Float32Array(length).fill(0.25)
  const buffer = offline.createBuffer(1, length, 96000)
  buffer.copyToChannel(tone, 0)
  const source = new AudioBufferSourceNode(offline, { buffer })
  source.connect(audioNode.node).connect(offline.destination)
  source.start(0)
  const rendered = (await offline.startRendering()).getChannelData(0)
  const latency = handler.getLatency()
  check(
    !held && latency < length && energy(rendered) > 0,
    `96 kHz offline (verdict ${plan().rtVerdict}): not held, the render completes ` +
      `(latency ${latency}, energy ${energy(rendered).toFixed(2)})`
  )

  audioNode.destroy()
  handler.destroy()
  contract.destroy()
  model.destroy()
  context.destroy()
  stopLogPump()
  channel.close()
  return { checks }
}

run()
  .then((result) => (window.anira_test_result = result))
  .catch((error: unknown) => {
    window.anira_test_result = {
      error: error instanceof Error ? `${error}\n${error.stack ?? ''}` : String(error),
    }
  })
