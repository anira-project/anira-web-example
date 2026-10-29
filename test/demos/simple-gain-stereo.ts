// Simple Gain Stereo, offline (stereoGain.ts): the built-in ONNX Runtime engine.
import { loadSimpleGainStereo } from '../../src/simple-gain-stereo/setup'
import { checkStereoGain } from './stereoGain'

export const run = () => checkStereoGain(loadSimpleGainStereo)
