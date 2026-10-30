// Steerable-NAFX, offline: the demo's chain (loadSteerableNafx + start) on the context's default
// pool, a tone rendered through its node. The oracle is the same model run once over the whole
// signal by onnxruntime-web on this page: the export's time axis is dynamic, and 132 zeros ahead
// of the signal are the history the declared overlap starts from. The streamed output must be
// that run's output, the handler's latency later: the declared window and overlap do what the
// 2.x JavaScript windowing did.
import * as ort from 'onnxruntime-web/wasm'
import { loadSteerableNafx } from '../../src/steerable-nafx/setup'
import { energy, renderOffline, sine, type Checks } from '../common'

const RATE = 44100
const QUANTUM = 128
const QUANTA = 128
const RECEPTIVE_FIELD = 132

// The whole signal through the model in one run, after RECEPTIVE_FIELD zeros.
const reference = async (samples: Float32Array): Promise<Float32Array> => {
  ort.env.wasm.numThreads = 1
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const response = await fetch(
    new URL('steerable-nafx-2_blocks-libtorch-dynamic.onnx', site)
  )
  const session = await ort.InferenceSession.create(
    new Uint8Array(await response.arrayBuffer())
  )
  const input = new Float32Array(RECEPTIVE_FIELD + samples.length)
  input.set(samples, RECEPTIVE_FIELD)
  const results = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 1, input.length]),
  })
  const output = results[session.outputNames[0]].data as Float32Array
  await session.release()
  return output
}

export const run = async (): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const audio = new OfflineAudioContext(1, QUANTUM * QUANTA, RATE)
  const loaded = await loadSteerableNafx()
  const chain = await loaded.start(audio, { waitMs: 500 })
  const demo = { ...loaded, ...chain, latency: chain.getLatency() }
  // The context's default pool: an offline render waits for its inferences, so its Workers
  // must be in their loops first.
  await demo.context.ready()
  check(
    demo.context.numInferenceThreads() >= 1,
    `the context's default pool of ${demo.context.numInferenceThreads()} inference threads is in its loops`
  )

  const samples = sine(QUANTUM * QUANTA, RATE, 220, 0.5)
  const [rendered] = await renderOffline(audio, demo.audioNode.node, [samples])
  const { latency } = demo
  const expected = await reference(samples)
  check(
    expected.length === samples.length,
    `onnxruntime-web ran the model over the whole signal (${expected.length} samples)`
  )

  let worst = 0
  let peak = 0
  for (let j = 0; j + latency < rendered.length; j++) {
    worst = Math.max(worst, Math.abs(rendered[j + latency] - expected[j]))
    peak = Math.max(peak, Math.abs(expected[j]))
  }
  check(
    energy(rendered) > 1 && rendered.every(Number.isFinite),
    `the node rendered audio (energy ${energy(rendered).toFixed(2)}, all finite)`
  )
  check(
    worst < 1e-4 * Math.max(1, peak),
    `the streamed output is the model's output over the whole signal, ${latency} samples ` +
      `later (worst error ${worst}, peak ${peak.toFixed(3)})`
  )

  demo.teardown()
  check(true, 'the demo tore down (the node, the handler, the context)')
  return checks
}
