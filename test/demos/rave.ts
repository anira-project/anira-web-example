// RAVE: Magnetic Resonator Piano, offline: the demo's chain (loadRave + start) on its context's
// one inference thread, whose engine runs each inference on two threads, a tone rendered through
// its node. The export is deterministic (the encoder takes the posterior mean, the decoder fills
// the cropped latents with zeros), so the oracle is the same model run by onnxruntime-web on this
// page on one thread, 2048 samples per call from the start of the signal, each call's state_out
// fed back as the next state_in, from zeros. That output already holds the model's own 2224
// samples of delay; the streamed output must be it, the handler's latency less those 2224 later,
// up to float rounding (two threads sum in another order than one). A state anira did not carry
// fails after the first block. The render waits for each inference in turn, so its time per
// block is about one inference's: reported, not checked.
import * as ort from 'onnxruntime-web/wasm'
import { loadRave } from '../../src/rave/setup'
import { energy, renderOffline, sine, type Checks } from '../common'

const RATE = 44100
const BLOCK = 2048
const BLOCKS = 16
const STATE = 63488
// The output's declared latency in public/rave.model.json: the network's own delay.
const MODEL_LATENCY = 2224

const reference = async (samples: Float32Array): Promise<Float32Array> => {
  ort.env.wasm.numThreads = 1
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const response = await fetch(new URL('rave.onnx', site))
  const session = await ort.InferenceSession.create(
    new Uint8Array(await response.arrayBuffer())
  )
  const output = new Float32Array(Math.floor(samples.length / BLOCK) * BLOCK)
  let state = new Float32Array(STATE)
  for (let start = 0; start < output.length; start += BLOCK) {
    const results = await session.run({
      audio: new ort.Tensor('float32', samples.slice(start, start + BLOCK), [1, 1, BLOCK]),
      state_in: new ort.Tensor('float32', state, [1, STATE]),
    })
    output.set(results.audio_out.data as Float32Array, start)
    state = results.state_out.data as Float32Array<ArrayBuffer>
  }
  await session.release()
  return output
}

export const run = async (): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const length = BLOCK * BLOCKS
  const audio = new OfflineAudioContext(1, length, RATE)
  const loaded = await loadRave()
  const chain = await loaded.start(audio, { waitMs: 3000 })
  const demo = { ...loaded, ...chain, latency: chain.latency() }
  // The context's pool: an offline render waits for its inferences, so its Worker must be in
  // its loop first (its engine's init, which starts onnxruntime-web's own Worker, comes before).
  await demo.context.ready()
  check(
    demo.context.threads >= 1,
    `the context's pool of ${demo.context.threads} inference thread(s) is in its loops`
  )

  const samples = sine(length, RATE, 220, 0.5)
  const renderStart = performance.now()
  const [rendered] = await renderOffline(audio, demo.audioNode.node, [samples])
  const renderMs = performance.now() - renderStart
  const shift = demo.latency - MODEL_LATENCY
  const expected = await reference(samples)

  let worst = 0
  let peak = 0
  let compared = 0
  for (let j = 0; j + shift < rendered.length && j < expected.length; j++) {
    worst = Math.max(worst, Math.abs(rendered[j + shift] - expected[j]))
    peak = Math.max(peak, Math.abs(expected[j]))
    compared++
  }
  check(
    energy(rendered) > 0 && rendered.every(Number.isFinite),
    `the node rendered audio (energy ${energy(rendered).toFixed(2)}, all finite; ${BLOCKS} ` +
      `blocks in ${renderMs.toFixed(0)} ms, ${(renderMs / BLOCKS).toFixed(1)} ms per block ` +
      `waiting for each inference)`
  )
  check(
    compared >= 4 * BLOCK && peak > 0 && worst < 1e-4 * Math.max(1, peak),
    `the streamed output is the model's with its state carried, ${demo.latency} samples ` +
      `later (${MODEL_LATENCY} of them the model's own; ${compared} samples compared, worst ` +
      `error ${worst}, peak ${peak.toFixed(3)})`
  )

  demo.teardown()
  check(true, 'the demo tore down (the node, the handler, the context)')
  return checks
}
