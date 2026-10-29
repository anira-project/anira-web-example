// ONNX Runtime Web Backend, offline (stereoGain.ts): the ONNX Runtime Web engine of the worker
// module, built and initialised in each inference Worker.
import { loadOnnxRuntimeWebBackend } from '../../src/onnxweb-backend/setup'
import { checkStereoGain } from './stereoGain'

export const run = () => checkStereoGain(loadOnnxRuntimeWebBackend)
