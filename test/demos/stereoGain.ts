// The offline check of the three stereo gain demos: the demo's chain on the context's default
// pool, a stereo tone rendered through its node with the gain automated mid-render.
// The model applies one gain per window of 512 samples, the value of the quantum that completes
// the window; the change lands on a window boundary, so each output sample is its input sample
// times the gain the model saw for its quantum (`effective` of the AudioParam's value), the
// handler's latency later.
import type { Anira, AniraAudioNode, Context } from '@anira-project/anira'
import { energy, renderOffline, sine, worstError, type Checks } from '../common'

const RATE = 48000
const QUANTUM = 128
const QUANTA = 64
const CHANGE_QUANTUM = 32
const GAIN_BEFORE = 0.5
const GAIN_AFTER = 1.5

/** A stereo gain demo as its setup loads it: the context, and `start` for the chain. */
export type StereoGainDemo = {
  anira: Anira
  context: Context
  start: (
    audio: BaseAudioContext,
    options: { waitMs: number }
  ) => Promise<{
    audioNode: AniraAudioNode
    gain: AudioParam
    latency: () => number
    teardown: () => void
  }>
}

export const checkStereoGain = async (
  load: () => Promise<StereoGainDemo>,
  { effective = (gain: number) => gain, what = 'the gain AudioParam' } = {}
): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, text: string) => checks.push({ ok, what: text })

  const audio = new OfflineAudioContext(2, QUANTUM * QUANTA, RATE)
  const loaded = await load()
  const chain = await loaded.start(audio, { waitMs: 500 })
  const demo = { ...loaded, ...chain, latency: chain.latency() }
  // The context's default pool: an offline render waits for its inferences, so its Workers
  // must be in their loops first.
  await demo.context.ready()
  check(
    demo.context.threads >= 1,
    `the context's default pool of ${demo.context.threads} inference threads is in its loops`
  )

  demo.gain.setValueAtTime(GAIN_BEFORE, 0)
  demo.gain.setValueAtTime(GAIN_AFTER, (CHANGE_QUANTUM * QUANTUM) / RATE)
  const left = sine(QUANTUM * QUANTA, RATE, 440)
  const right = sine(QUANTUM * QUANTA, RATE, 660, 0.125)
  const rendered = await renderOffline(audio, demo.audioNode.node, [left, right])
  const { latency } = demo
  const gainAt = (j: number) =>
    effective(Math.floor(j / QUANTUM) < CHANGE_QUANTUM ? GAIN_BEFORE : GAIN_AFTER)
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
    `each channel is its input times ${what}, the AudioParam automated from ${GAIN_BEFORE} ` +
      `to ${GAIN_AFTER} at quantum ${CHANGE_QUANTUM}, ${latency} samples later (worst error ` +
      `${worst})`
  )

  demo.teardown()
  check(true, 'the demo tore down (the node, the handler, the context)')
  return checks
}
