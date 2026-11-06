// What the check pages share: the verdict's shape, an offline render through an anira node, and
// the rules of what a measured prepare reports.
import {
  anira_rt_verdict,
  anira_warmup_outcome,
  type PlanReport,
} from '@anira-project/anira'

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

/**
 * What a prepare under a measured budget and the until-stable warm-up reports, per plan: the
 * rules, never a value (a slower machine measures more). The outcome is STABLE or CAPPED at a
 * first prepare and REUSED when a re-prepare found the model's figure; 4 to 32 warm-up
 * inferences; the budget is the figure; the median is at most the figure; the real-time factor
 * is positive; and the verdict is what the documented thresholds give for the load (the factor
 * over the parallel inferences): comfortable below 0.75, marginal below 1.
 */
export const checkPlans = (report: PlanReport, { reused = false } = {}): Checks =>
  report.plans().map((plan, index) => {
    const load = plan.rtFactor / plan.rtParallel
    const verdict =
      load < 0.75
        ? anira_rt_verdict.ANIRA_RT_COMFORTABLE
        : load < 1
          ? anira_rt_verdict.ANIRA_RT_MARGINAL
          : anira_rt_verdict.ANIRA_RT_NOT_REALTIME
    const outcomes: number[] = reused
      ? [anira_warmup_outcome.ANIRA_WARMUP_OUTCOME_REUSED]
      : [
          anira_warmup_outcome.ANIRA_WARMUP_OUTCOME_STABLE,
          anira_warmup_outcome.ANIRA_WARMUP_OUTCOME_CAPPED,
        ]
    return {
      ok:
        outcomes.includes(plan.warmupOutcome) &&
        plan.warmupIterations >= 4 &&
        plan.warmupIterations <= 32 &&
        plan.budgetMs > 0 &&
        plan.budgetMs === plan.measuredMs &&
        plan.medianMs <= plan.measuredMs &&
        plan.rtFactor > 0 &&
        plan.rtParallel >= 1 &&
        plan.rtVerdict === verdict,
      what:
        `plan ${index}: outcome ${plan.warmupOutcome} after ${plan.warmupIterations} warm-up ` +
        `inferences, budget ${plan.budgetMs} ms = measured ${plan.measuredMs} ms >= median ` +
        `${plan.medianMs} ms, real-time factor ${plan.rtFactor} of ${plan.rtParallel}: verdict ` +
        `${plan.rtVerdict} (the thresholds give ${verdict} for load ${load})`,
    }
  })
