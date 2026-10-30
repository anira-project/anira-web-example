// GuitarLSTM, offline: the demo's chain (loadGuitarLstm + start) on the context's default pool, a
// tone rendered through its node. The oracle is the same model run by
// onnxruntime-web on this page over one batch per 512 samples, unfolded in JavaScript here:
// element b of a batch is the 150 samples ending at that batch's sample b, with 149 zeros
// before the signal as the first history. The streamed output must be the oracle's, the
// handler's latency later: the worklet's stage unfolds the windows the same way.
import * as ort from 'onnxruntime-web/wasm'
import { loadGuitarLstm } from '../../src/guitar-lstm/setup'
import { energy, renderOffline, sine, type Checks } from '../common'

const RATE = 44100
const QUANTUM = 128
const QUANTA = 160
const BATCH = 512
const CONTEXT = 150

const reference = async (samples: Float32Array): Promise<Float32Array> => {
  ort.env.wasm.numThreads = 1
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const response = await fetch(new URL('GuitarLSTM-libtorch-dynamic.onnx', site))
  const session = await ort.InferenceSession.create(
    new Uint8Array(await response.arrayBuffer())
  )
  const history = new Float32Array(CONTEXT - 1 + samples.length)
  history.set(samples, CONTEXT - 1)
  const output = new Float32Array(Math.floor(samples.length / BATCH) * BATCH)
  for (let start = 0; start < output.length; start += BATCH) {
    const input = new Float32Array(BATCH * CONTEXT)
    for (let b = 0; b < BATCH; b++)
      input.set(history.subarray(start + b, start + b + CONTEXT), b * CONTEXT)
    const results = await session.run({
      [session.inputNames[0]]: new ort.Tensor('float32', input, [BATCH, 1, CONTEXT]),
    })
    output.set(results[session.outputNames[0]].data as Float32Array, start)
  }
  await session.release()
  return output
}

export const run = async (): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const audio = new OfflineAudioContext(1, QUANTUM * QUANTA, RATE)
  const loaded = await loadGuitarLstm()
  const chain = await loaded.start(audio, { waitMs: 1000 })
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

  let worst = 0
  let peak = 0
  let compared = 0
  for (let j = 0; j + latency < rendered.length && j < expected.length; j++) {
    worst = Math.max(worst, Math.abs(rendered[j + latency] - expected[j]))
    peak = Math.max(peak, Math.abs(expected[j]))
    compared++
  }
  check(
    energy(rendered) > 1 && rendered.every(Number.isFinite),
    `the node rendered audio (energy ${energy(rendered).toFixed(2)}, all finite)`
  )
  check(
    compared >= BATCH && worst < 1e-4 * Math.max(1, peak),
    `the streamed output is the model's over the stage's batched windows, ${latency} ` +
      `samples later (${compared} samples compared, worst error ${worst}, peak ` +
      `${peak.toFixed(3)})`
  )

  demo.teardown()
  check(true, 'the demo tore down (the node, the handler, the context)')
  return checks
}
