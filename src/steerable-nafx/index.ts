import { AniraWeb } from '@anira-project/anira'
import { setupDemoUI } from '../utils/setupDemoUI'
import workletUrl from './audio-worklet.ts?worker&url'

const aniraWeb = await AniraWeb.create()
await aniraWeb.spinUpInferenceWorker()

const audio = new Audio('guitar.mp3')
const audioContext = new AudioContext({ sampleRate: 44100 })

const { removeLoadingIndicator, connectAudioGraph } = await setupDemoUI(
  aniraWeb,
  audio,
  audioContext
)

// -------------------
// ------ WASM ------
// -------------------

const BUFFER_SIZE = 1024
const CNN_RECEPTIVE_FIELD = 132
const REALTIME_THRESHOLD_MS = (BUFFER_SIZE / audioContext.sampleRate) * 1000

const res = await fetch('steerable-nafx-2_blocks-libtorch-dynamic.onnx')
if (!res.ok) throw new Error('Failed to load model')
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraWeb.VectorModelData([
  aniraWeb.ModelData(modelBuffer, aniraWeb.InferenceBackend.ONNX),
])

// Input: [1, 1, bufferSize + receptiveField], Output: [1, 1, bufferSize]
const inputShapeList = aniraWeb.TensorShapeList([
  [1, 1, BUFFER_SIZE + CNN_RECEPTIVE_FIELD],
])
const outputShapeList = aniraWeb.TensorShapeList([[1, 1, BUFFER_SIZE]])
const tensorShape = aniraWeb.TensorShape(inputShapeList, outputShapeList)
const vectorTensorShape = aniraWeb.VectorTensorShape([tensorShape])

// Mono: 1 channel, bufferSize samples
const preprocessChannels = aniraWeb.VectorSizeT([1])
const postprocessChannels = aniraWeb.VectorSizeT([1])
const preprocessSize = aniraWeb.VectorSizeT([BUFFER_SIZE])
const postprocessSize = aniraWeb.VectorSizeT([BUFFER_SIZE])

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
  REALTIME_THRESHOLD_MS, // max inference time in ms (realtime threshold)
  2, // warm-up iterations
  false, // session exclusive processor
  0, // blocking ratio
  1 // num parallel processors
)

// Use JSPrePostProcessor so the custom CNN windowing logic runs in JS
const ppProcessor = aniraWeb.JSPrePostProcessor(inferenceConfig)

const hostAudioConfig = aniraWeb.HostConfig(128, 44100, false, 0)
const inferenceHandler = aniraWeb.InferenceHandler(ppProcessor, inferenceConfig)
inferenceHandler.setInferenceBackend(aniraWeb.InferenceBackend.ONNX)
inferenceHandler.prepare(hostAudioConfig)

// --------------------
// ------ Audio -------
// --------------------

await aniraWeb.registerAudioWorkletForContext(audioContext, workletUrl)
const inferenceNode = await aniraWeb.configureAudioWorklet(
  audioContext,
  inferenceHandler,
  ppProcessor,
  'steerable-nafx',
  { inputChannels: 1, outputChannels: 1, maxBufferSize: BUFFER_SIZE }
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

removeLoadingIndicator()
console.log('Steerable-NAFX demo initialized!')
