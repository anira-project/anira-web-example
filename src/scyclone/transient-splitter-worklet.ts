// Port of Scyclone/source/dsp/transientSplitter/TransientSplitter.cpp.
// Mono in / mono out. Splits the signal into "attack" and "sustain"
// components using three envelope followers and remixes them.

class EnvelopeFollower {
  private last = 0
  private attackCoeff = 1
  private releaseCoeff = 1
  private readonly sampleRate: number

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  setTimes(attackSec: number, releaseSec: number) {
    this.attackCoeff = attackSec > 0 ? Math.exp(-1 / (attackSec * this.sampleRate)) : 0
    this.releaseCoeff = releaseSec > 0 ? Math.exp(-1 / (releaseSec * this.sampleRate)) : 0
  }

  process(rectified: number): number {
    const coeff = this.last < rectified ? this.attackCoeff : this.releaseCoeff
    const out = coeff * this.last + (1 - coeff) * rectified
    this.last = out
    return out
  }
}

class TransientSplitterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Original: tranShaperRange -1..1, but Scyclone's UI maps a single
      // "shaper" knob -1..1 to (attack, sustain) gains. Here we expose the
      // already-mapped attack and sustain directly so the host can drive them
      // however it likes.
      { name: 'attack', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' as const },
      { name: 'sustain', defaultValue: 1, minValue: 0, maxValue: 2, automationRate: 'k-rate' as const },
      // Envelope2 attack time in seconds (Scyclone range 0.05..2.0).
      { name: 'attackTime', defaultValue: 0.5, minValue: 0.001, maxValue: 2, automationRate: 'k-rate' as const },
    ]
  }

  // Defaults match TransientSplitter.h: detector(0, 3), env1(0, 0.3), env2(0.5, 0.3).
  // detector: instant attack, very slow release -> peak hold.
  private detector = new EnvelopeFollower(sampleRate)
  private env1 = new EnvelopeFollower(sampleRate)
  private env2 = new EnvelopeFollower(sampleRate)
  private currentAttackTime = -1

  constructor() {
    super()
    const releaseTime = 0.3
    this.detector.setTimes(0, releaseTime * 10)
    this.env1.setTimes(0, releaseTime)
    this.env2.setTimes(0.5, releaseTime)
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (!output || output.length === 0) return true

    const attackGain = parameters.attack[0]
    const sustainGain = parameters.sustain[0]
    const attackTime = parameters.attackTime[0]

    if (attackTime !== this.currentAttackTime) {
      this.env2.setTimes(attackTime, 0.3)
      this.currentAttackTime = attackTime
    }

    const inCh = input?.[0]
    const outCh = output[0]
    const len = outCh.length

    if (!inCh) {
      outCh.fill(0)
      return true
    }

    for (let i = 0; i < len; i++) {
      const x = inCh[i]
      const rect = Math.abs(x)
      const det = this.detector.process(rect)
      const e1 = this.env1.process(rect)
      const e2 = this.env2.process(rect)
      const detSafe = det > 1e-9 ? det : 1e-9
      let attack = Math.min(Math.abs(e1 - e2) / detSafe, 1)
      const sustain = 1 - attack
      outCh[i] = attack * attackGain * x + sustain * sustainGain * x
    }
    return true
  }
}

registerProcessor('transient-splitter', TransientSplitterProcessor)
