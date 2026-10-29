// Simple Gain Stereo, offline: the demo's chain (createSimpleGainStereo) on two of the page's
// inference threads, a stereo tone rendered through its node with the gain automated mid-render.
// The model applies one gain per window of 512 samples, the value of the quantum that completes
// the window; the change lands on a window boundary, so each output sample is its input sample
// times the gain of its quantum, the handler's latency later.
import { createSimpleGainStereo } from '../../src/simple-gain-stereo/setup'
import { InferenceThreads } from '../../src/utils/inferenceThreads'
import { energy, renderOffline, sine, worstError, type Checks } from '../common'

const RATE = 48000
const QUANTUM = 128
const QUANTA = 64
const CHANGE_QUANTUM = 32
const GAIN_BEFORE = 0.5
const GAIN_AFTER = 1.5

export const run = async (): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const audio = new OfflineAudioContext(2, QUANTUM * QUANTA, RATE)
  const demo = await createSimpleGainStereo(audio, { waitMs: 500 })
  const threads = new InferenceThreads(demo.anira, demo.context)
  threads.add()
  threads.add()
  await threads.ready()
  check(true, `the page's ${threads.count} inference threads are in their loops`)

  demo.gain.setValueAtTime(GAIN_BEFORE, 0)
  demo.gain.setValueAtTime(GAIN_AFTER, (CHANGE_QUANTUM * QUANTUM) / RATE)
  const left = sine(QUANTUM * QUANTA, RATE, 440)
  const right = sine(QUANTUM * QUANTA, RATE, 660, 0.125)
  const rendered = await renderOffline(audio, demo.audioNode.node, [left, right])
  const { latency } = demo
  const gainAt = (j: number) =>
    Math.floor(j / QUANTUM) < CHANGE_QUANTUM ? GAIN_BEFORE : GAIN_AFTER
  const worst = Math.max(
    worstError(rendered[0], latency, (j) => gainAt(j) * left[j]),
    worstError(rendered[1], latency, (j) => gainAt(j) * right[j])
  )
  check(
    energy(rendered[0]) > 1 && energy(rendered[1]) > 0.1,
    `the node rendered both channels (energy ${energy(rendered[0]).toFixed(2)}, ` +
      `${energy(rendered[1]).toFixed(2)})`
  )
  check(
    worst < 1e-6,
    `each channel is its input times the gain AudioParam, automated from ${GAIN_BEFORE} to ` +
      `${GAIN_AFTER} at quantum ${CHANGE_QUANTUM}, ${latency} samples later (worst error ${worst})`
  )

  await threads.remove()
  await threads.remove()
  check(threads.count === 0, 'both inference threads stopped and were destroyed')
  demo.teardown()
  check(true, 'the demo tore down (the node, the handler, the context)')
  return checks
}
