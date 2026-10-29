// Custom pre/post processing, offline (stereoGain.ts): the gain AudioParam automated from 0.5
// to 1.5, which the worklet's JavaScript stage clamps to 1.0 before the model sees it.
import { createGainClamp } from '../../src/pre-post-processors/setup'
import { checkStereoGain } from './stereoGain'

export const run = () =>
  checkStereoGain(createGainClamp, {
    effective: (gain) => Math.min(1, gain),
    what: "the gain clamped to 1.0 by the worklet's stage",
  })
