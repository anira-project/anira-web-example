// The worker module of test/slow.html: its inference Worker imports it before its loop. A
// deliberately slow registered (JavaScript) engine: each call sleeps 0.9 of a hop period of
// HOP samples at 48 kHz (Atomics.wait, which a Worker may call) and then passes its input
// through, so its real-time factor at 48 kHz is 0.9 or more by construction, and twice that at
// 96 kHz. Each call is counted on a BroadcastChannel, so the page sees whether a prepare ran a
// pass.
import { anira_status, defineEngine, engineTensors } from '@anira-project/anira/scope'

/** The engine's reverse-URI id: the model entry names it, the pipeline registers it. */
export const SLOW_ENGINE = 'org.anira-web-example.test.slow'
/** The BroadcastChannel the engine posts one message per call on. */
export const SLOW_CALLS = 'anira-web-example.test.slow-calls'
/** The model's hop: samples per inference. */
export const HOP = 2048

const SLEEP_MS = (0.9 * 1000 * HOP) / 48000
const sleeper = new Int32Array(new SharedArrayBuffer(4))
const calls = new BroadcastChannel(SLOW_CALLS)

defineEngine(SLOW_ENGINE, (env) => ({
  process(ctx) {
    Atomics.wait(sleeper, 0, 0, SLEEP_MS)
    calls.postMessage(1)
    const { inputs, outputs } = engineTensors(env, ctx)
    if (!inputs[0]?.f32 || !outputs[0]?.f32) return anira_status.ANIRA_ERROR_NOT_SUPPORTED
    outputs[0].f32.set(inputs[0].f32)
    return anira_status.ANIRA_OK
  },
}))
