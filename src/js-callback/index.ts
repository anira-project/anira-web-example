import { AniraWeb } from 'anira-web'
import { setupDemoUI } from '../utils/setupDemoUI'

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
  aniraWeb.ModelData(modelBuffer, aniraWeb.InferenceBackend.CUSTOM),
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
// With JS callback, but passthrough implemented in Wasm
const jsBackendBase = aniraWeb.JSBackendBase(inferenceConfig)

await aniraWeb.registerProcessor(jsBackendBase, 'JSBackendBase')

const ppProcessor = aniraWeb.PrePostProcessor(inferenceConfig)
ppProcessor.setInput(1, 0, 1) // Set gain tensor (tensor 1, channel 0) to 1.0

const hostAudioConfig = aniraWeb.HostConfig(128, 48000, false, 0)
const inferenceHandler = aniraWeb.InferenceHandler(
  ppProcessor,
  inferenceConfig,
  jsBackendBase
)
inferenceHandler.setInferenceBackend(aniraWeb.InferenceBackend.CUSTOM)
inferenceHandler.prepare(hostAudioConfig)

// --------------------
// ------ Audio -------
// --------------------

await aniraWeb.registerAudioWorkletForContext(audioContext)
const inferenceNode = await aniraWeb.configureAudioWorklet(
  audioContext,
  inferenceHandler,
  ppProcessor
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

removeLoadingIndicator()
console.log('Demo initialized and ready!')
