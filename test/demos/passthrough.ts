// The offline check of the two JavaScript-engine demos (JS Callback, JS Copying): the demo's
// chain on its inference threads, a stereo tone through its node. The engine
// passes the audio through, so each output channel is its input, the handler's latency later.
import type { Anira, AniraAudioNode, Context } from '@anira-project/anira'
import { InferenceThreads } from '../../src/utils/inferenceThreads'
import { energy, renderOffline, sine, worstError, type Checks } from '../common'

const RATE = 48000
const QUANTUM = 128
const QUANTA = 64

/** A passthrough demo as its setup loads it: the context, and `start` for the chain. */
export type PassthroughDemo = {
  anira: Anira
  context: Context
  start: (
    audio: BaseAudioContext,
    options: { waitMs: number }
  ) => Promise<{
    audioNode: AniraAudioNode
    getLatency: () => number
    teardown: () => void
  }>
}

export const checkPassthrough = async (
  load: () => Promise<PassthroughDemo>,
  { ownThread = false } = {}
): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const audio = new OfflineAudioContext(2, QUANTUM * QUANTA, RATE)
  const loaded = await load()
  const chain = await loaded.start(audio, { waitMs: 500 })
  const demo = { ...loaded, ...chain, latency: chain.getLatency() }
  // JS Callback starts its own inference thread (a context without a pool); JS Copying has the
  // context's default pool. Either way the Workers must be in their loops first.
  const threads = ownThread ? new InferenceThreads(demo.anira, demo.context) : null
  threads?.add()
  await (threads ? threads.ready() : demo.context.ready())
  const count = threads ? threads.count : demo.context.numInferenceThreads()
  check(
    count >= 1,
    `${count} inference thread(s) booted the worker module's engine ` +
      `(${threads ? "the page's own" : "the context's default pool"})`
  )

  const left = sine(QUANTUM * QUANTA, RATE, 440)
  const right = sine(QUANTUM * QUANTA, RATE, 660, 0.125)
  const rendered = await renderOffline(audio, demo.audioNode.node, [left, right])
  const { latency } = demo
  const worst = Math.max(
    worstError(rendered[0], latency, (j) => left[j]),
    worstError(rendered[1], latency, (j) => right[j])
  )
  check(
    energy(rendered[0]) > 1,
    `the node rendered audio (energy ${energy(rendered[0]).toFixed(2)})`
  )
  check(
    worst === 0,
    `each channel is its input, passed through by the JavaScript engine, ${latency} samples ` +
      `later (worst error ${worst})`
  )

  await threads?.remove()
  demo.teardown()
  check(true, 'the demo tore down (the node, the handler, the context)')
  return checks
}
