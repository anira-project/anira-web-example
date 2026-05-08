import { AniraWeb } from '@anira-project/anira'
import { setupDemoUI } from '../utils/setupDemoUI'
import workletUrl from './audio-worklet.ts?worker&url'

const aniraWeb = await AniraWeb.create()
await aniraWeb.spinUpInferenceWorker()

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const { removeLoadingIndicator, connectAudioGraph } = await setupDemoUI(
  aniraWeb,
  audio,
  audioContext
)

// -------------------
// ------ WASM ------
// -------------------

const res = await fetch('simple-gain-stereo.onnx')
if (!res.ok) {
  throw new Error('Failed to load model')
}
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraWeb.VectorModelData([
  aniraWeb.ModelData(modelBuffer, aniraWeb.InferenceBackend.ONNX),
])

const inputShapeList = aniraWeb.TensorShapeList([[1, 2, 512], [1]])
const outputShapeList = aniraWeb.TensorShapeList([[1, 2, 512], [1]])
const tensorShape = aniraWeb.TensorShape(inputShapeList, outputShapeList)
const vectorTensorShape = aniraWeb.VectorTensorShape([tensorShape])

const preprocessChannels = aniraWeb.VectorSizeT([2, 1])
const postprocessChannels = aniraWeb.VectorSizeT([2, 1])
const preprocessSize = aniraWeb.VectorSizeT([512, 0])
const postprocessSize = aniraWeb.VectorSizeT([512, 0])

const processingSpec = aniraWeb.ProcessingSpec(
  preprocessChannels,
  postprocessChannels,
  preprocessSize,
  postprocessSize
)

const inferenceConfig = aniraWeb.InferenceConfig(
  vectorModelData,
  vectorTensorShape,
  processingSpec,
  5,
  10,
  false,
  0,
  1
)

// Create a JSPrePostProcessor on the main thread. The actual custom JS logic
// (GainPrePostProcessor subclass) lives in the audio worklet — that's where
// the pre/post callbacks fire during real-time processing.
const ppProcessor = aniraWeb.JSPrePostProcessor(inferenceConfig)
ppProcessor.setInput(1, 0, 1) // Set gain tensor (tensor 1, channel 0) to 1.0

const hostAudioConfig = aniraWeb.HostConfig(128, 48000, false, 0)
const inferenceHandler = aniraWeb.InferenceHandler(ppProcessor, inferenceConfig)
inferenceHandler.setInferenceBackend(aniraWeb.InferenceBackend.ONNX)
inferenceHandler.prepare(hostAudioConfig)

// --------------------
// ------ Audio -------
// --------------------

// Register a custom audio worklet that sets up the JSPrePostProcessor
// subclass on the worklet thread, where pre/post processing actually runs.
await aniraWeb.registerAudioWorkletForContext(audioContext, workletUrl)
const inferenceNode = await aniraWeb.configureAudioWorklet(
  audioContext,
  inferenceHandler,
  ppProcessor,
  'pre-post-processors'
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

// -------------------
// ------- UI --------
// -------------------

const gainSlider = document.getElementById('gain-slider')! as HTMLInputElement
const gainValue = document.getElementById('gain-value')!

// The slider sets the raw gain on the main thread via setInput.
// On the worklet thread, GainPrePostProcessor.preProcess() reads this
// value and squares it before passing it to the C++ pre-processing,
// giving the slider an exponential curve feel.
gainSlider.oninput = () => {
  const val = parseFloat(gainSlider.value)
  gainValue.textContent = val.toFixed(2)
  ppProcessor.setInput(val, 0, 1)
}

removeLoadingIndicator()
console.log('Demo initialized and ready!')
