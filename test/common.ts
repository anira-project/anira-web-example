// What the check pages share: the verdict's shape and an offline render through an anira node.

export type Check = { ok: boolean; what: string }
export type Checks = Check[]

/** `amplitude * sin(2 pi f t)` over `length` samples at `rate`. */
export const sine = (length: number, rate: number, frequency = 440, amplitude = 0.25) => {
  const samples = new Float32Array(length)
  for (let i = 0; i < samples.length; i++)
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / rate)
  return samples
}

/**
 * Render `channels` (one array per input channel) through `node` on `audio`, which must have as
 * many channels as the node's output; returns the rendered channels.
 */
export const renderOffline = async (
  audio: OfflineAudioContext,
  node: AudioNode,
  channels: Float32Array<ArrayBuffer>[]
): Promise<Float32Array[]> => {
  // Kept in a buffer of its own: Firefox detaches an AudioBuffer's channel arrays once a source
  // node plays it.
  const input = audio.createBuffer(channels.length, channels[0].length, audio.sampleRate)
  channels.forEach((samples, c) => input.copyToChannel(samples, c))
  const source = new AudioBufferSourceNode(audio, { buffer: input })
  source.connect(node).connect(audio.destination)
  source.start(0)
  const rendered = await audio.startRendering()
  return Array.from({ length: rendered.numberOfChannels }, (_, c) =>
    rendered.getChannelData(c).slice()
  )
}

/** The largest |rendered[j + latency] - expected(j)| over the rendered range. */
export const worstError = (
  rendered: Float32Array,
  latency: number,
  expected: (j: number) => number
): number => {
  let worst = 0
  for (let j = 0; j + latency < rendered.length; j++)
    worst = Math.max(worst, Math.abs(rendered[j + latency] - expected(j)))
  return worst
}

export const energy = (samples: Float32Array): number =>
  samples.reduce((sum, x) => sum + x * x, 0)
