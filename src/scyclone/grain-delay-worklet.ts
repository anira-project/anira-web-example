// Pure-JS granular delay. Replaces Scyclone's RNBO patcher (rnbo_granular).
// Mono in / mono out. Maintains a circular delay buffer and a small voice
// pool; new windowed grains spawn at `interval` ms and read from the buffer
// at `delayPos` ms in the past, transposed by `pitch` semitones.

const MAX_VOICES = 24
const MAX_DELAY_SECONDS = 2

type Voice = {
  active: boolean
  age: number       // samples since spawn
  length: number    // grain length in samples
  readPos: number   // float read position in the circular buffer
  rate: number      // playback rate (frozen at spawn time)
}

class GrainDelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Time between grain spawns (ms). Smaller = denser cloud.
      { name: 'interval', defaultValue: 80, minValue: 5, maxValue: 1000, automationRate: 'k-rate' as const },
      // Grain length (ms).
      { name: 'grainSize', defaultValue: 80, minValue: 10, maxValue: 500, automationRate: 'k-rate' as const },
      // How far back in the buffer to start reading (ms).
      { name: 'delayPos', defaultValue: 120, minValue: 1, maxValue: 1000, automationRate: 'k-rate' as const },
      // Transposition in semitones.
      { name: 'pitch', defaultValue: 0, minValue: -24, maxValue: 24, automationRate: 'k-rate' as const },
    ]
  }

  private bufferSize = Math.ceil(MAX_DELAY_SECONDS * sampleRate)
  private buffer = new Float32Array(this.bufferSize)
  private writePos = 0
  private samplesUntilNextGrain = 0
  private voices: Voice[] = Array.from({ length: MAX_VOICES }, () => ({
    active: false,
    age: 0,
    length: 0,
    readPos: 0,
    rate: 1,
  }))

  private spawnVoice(intervalSamples: number, grainSamples: number, delaySamples: number, rate: number) {
    let voice: Voice | undefined
    for (const v of this.voices) {
      if (!v.active) {
        voice = v
        break
      }
    }
    if (!voice) {
      // Steal the oldest voice.
      let oldest = this.voices[0]
      for (const v of this.voices) if (v.age > oldest.age) oldest = v
      voice = oldest
    }
    voice.active = true
    voice.age = 0
    voice.length = grainSamples
    voice.rate = rate
    let start = this.writePos - delaySamples
    while (start < 0) start += this.bufferSize
    voice.readPos = start
    this.samplesUntilNextGrain = intervalSamples
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const output = outputs[0]?.[0]
    if (!output) return true
    const input = inputs[0]?.[0]
    const len = output.length

    const intervalMs = parameters.interval[0]
    const grainSizeMs = parameters.grainSize[0]
    const delayPosMs = parameters.delayPos[0]
    const pitchSemis = parameters.pitch[0]

    const intervalSamples = Math.max(1, Math.round((intervalMs / 1000) * sampleRate))
    const grainSamples = Math.max(1, Math.round((grainSizeMs / 1000) * sampleRate))
    const delaySamples = Math.min(
      this.bufferSize - 1,
      Math.max(1, Math.round((delayPosMs / 1000) * sampleRate))
    )
    const rate = Math.pow(2, pitchSemis / 12)

    const TWO_PI = Math.PI * 2

    for (let i = 0; i < len; i++) {
      // 1. Write input into delay buffer.
      this.buffer[this.writePos] = input ? input[i] : 0

      // 2. Spawn a grain if it's time.
      if (this.samplesUntilNextGrain <= 0) {
        this.spawnVoice(intervalSamples, grainSamples, delaySamples, rate)
      }
      this.samplesUntilNextGrain--

      // 3. Sum active voices.
      let sample = 0
      for (const v of this.voices) {
        if (!v.active) continue
        // Hann window over [0, length].
        const phase = v.age / v.length
        const win = 0.5 * (1 - Math.cos(TWO_PI * phase))

        // Linear interpolation read.
        let rp = v.readPos
        if (rp >= this.bufferSize) rp -= this.bufferSize
        if (rp < 0) rp += this.bufferSize
        const i0 = Math.floor(rp)
        const i1 = i0 + 1 >= this.bufferSize ? 0 : i0 + 1
        const frac = rp - i0
        const s = this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac

        sample += s * win

        v.readPos += v.rate
        if (v.readPos >= this.bufferSize) v.readPos -= this.bufferSize
        v.age++
        if (v.age >= v.length) v.active = false
      }

      output[i] = sample

      this.writePos++
      if (this.writePos >= this.bufferSize) this.writePos = 0
    }

    return true
  }
}

registerProcessor('grain-delay', GrainDelayProcessor)
