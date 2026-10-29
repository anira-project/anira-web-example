// Streaming Gain Stereo, offline: the demo's chain (createStreamingGainStereo) on one of the
// page's inference threads, a stereo tone into the audio node and a 3 Hz gain signal into the
// gain node. Each output sample is its input sample times the gain sample of the same instant,
// the handler's latency later; the gain node plays the model's copy of the gain.
import { createStreamingGainStereo } from '../../src/streaming-gain-stereo/setup'
import { InferenceThreads } from '../../src/utils/inferenceThreads'
import { energy, sine, worstError, type Checks } from '../common'

const RATE = 48000
const QUANTUM = 128
const QUANTA = 64

export const run = async (): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const audio = new OfflineAudioContext(3, QUANTUM * QUANTA, RATE)
  const demo = await createStreamingGainStereo(audio, { waitMs: 500 })
  const threads = new InferenceThreads(demo.anira, demo.context)
  threads.add()
  await threads.ready()

  const length = QUANTUM * QUANTA
  const left = sine(length, RATE, 440)
  const right = sine(length, RATE, 660, 0.125)
  const gain = new Float32Array(length)
  for (let i = 0; i < length; i++)
    gain[i] = 1.25 + 0.75 * Math.sin((2 * Math.PI * 3 * i) / RATE)
  const stereo = audio.createBuffer(2, length, RATE)
  stereo.copyToChannel(left, 0)
  stereo.copyToChannel(right, 1)
  const gainBuffer = audio.createBuffer(1, length, RATE)
  gainBuffer.copyToChannel(gain, 0)
  // Channels 0 and 1 of the render: the audio node; channel 2: the gain node.
  const merger = new ChannelMergerNode(audio, { numberOfInputs: 3 })
  const splitter = new ChannelSplitterNode(audio, { numberOfOutputs: 2 })
  const audioSource = new AudioBufferSourceNode(audio, { buffer: stereo })
  const gainSource = new AudioBufferSourceNode(audio, { buffer: gainBuffer })
  audioSource.connect(demo.audioNode.node).connect(splitter)
  splitter.connect(merger, 0, 0)
  splitter.connect(merger, 1, 1)
  gainSource.connect(demo.gainNode.node).connect(merger, 0, 2)
  merger.connect(audio.destination)
  audioSource.start(0)
  gainSource.start(0)
  const rendered = await audio.startRendering()
  const { latency } = demo
  const out = [0, 1, 2].map((c) => rendered.getChannelData(c))
  const worst = Math.max(
    worstError(out[0], latency, (j) => gain[j] * left[j]),
    worstError(out[1], latency, (j) => gain[j] * right[j])
  )
  const worstGain = worstError(out[2], latency, (j) => gain[j])
  check(
    energy(out[0]) > 1,
    `the audio node rendered (energy ${energy(out[0]).toFixed(2)})`
  )
  check(
    worst < 1e-6,
    `each channel is its input times the gain stream, sample by sample, ${latency} samples ` +
      `later (worst error ${worst})`
  )
  check(
    worstGain < 1e-6,
    `the gain node plays the model's copy of the gain stream (worst error ${worstGain})`
  )

  await threads.remove()
  demo.teardown()
  check(true, 'the demo tore down (the two nodes, the handler, the context)')
  return checks
}
