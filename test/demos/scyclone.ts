// RAVE: Funk & Djembe, offline: the demo's chain (createScyclone) on two of the page's inference
// threads, one tone into both models' nodes, the funk model on channel 0 of the render, the
// djembe model on channel 1. RAVE samples noise inside the model, so there is no exact oracle:
// each stream must be finite, silent for the handler's latency (nothing delivered yet), then
// carry audio that is the model's and not the miss policy's bypassed input.
import { createScyclone } from '../../src/scyclone/setup'
import { InferenceThreads } from '../../src/utils/inferenceThreads'
import { energy, sine, type Checks } from '../common'

const RATE = 48000
const WINDOW = 16384
const WINDOWS = 4

export const run = async (): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const length = WINDOW * WINDOWS
  const audio = new OfflineAudioContext(2, length, RATE)
  const demo = await createScyclone(audio, { waitMs: 3000 })
  const threads = new InferenceThreads(demo.anira, demo.context)
  threads.add()
  threads.add()
  await threads.ready()

  const samples = sine(length, RATE, 110, 0.5)
  const input = audio.createBuffer(1, length, RATE)
  input.copyToChannel(samples, 0)
  const source = new AudioBufferSourceNode(audio, { buffer: input })
  const merger = new ChannelMergerNode(audio, { numberOfInputs: 2 })
  source.connect(demo.funk.audioNode.node).connect(merger, 0, 0)
  source.connect(demo.djembe.audioNode.node).connect(merger, 0, 1)
  merger.connect(audio.destination)
  source.start(0)
  const rendered = await audio.startRendering()

  for (const [c, name, stream] of [
    [0, 'funk drums', demo.funk],
    [1, 'djembe', demo.djembe],
  ] as const) {
    const out = rendered.getChannelData(c)
    const { latency } = stream
    const head = out.subarray(0, Math.min(latency, out.length))
    const tail = out.subarray(latency)
    let bypassed = 0
    for (let j = 0; j < tail.length; j++)
      bypassed += Math.abs(tail[j] - samples[j]) < 1e-7 ? 1 : 0
    check(
      out.every(Number.isFinite) && energy(head) === 0,
      `${name}: finite, silent for its latency of ${latency} samples`
    )
    check(
      tail.length >= WINDOW && energy(tail) > 1 && bypassed < tail.length / 100,
      `${name}: the model's audio after the latency (${tail.length} samples, energy ` +
        `${energy(tail).toFixed(1)}, ${bypassed} samples equal to the input)`
    )
  }

  await threads.removeAll()
  demo.teardown()
  check(true, 'the demo tore down (the two nodes, the handlers, the context)')
  return checks
}
