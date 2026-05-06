import { AniraWeb } from 'anira-web'
import { setupDemoUI } from '../utils/setupDemoUI'

const aniraWeb = await AniraWeb.create()
await aniraWeb.spinUpInferenceWorker()

const audio = new Audio('drumloop.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const { removeLoadingIndicator, connectAudioGraph } = await setupDemoUI(
  aniraWeb,
  audio,
  audioContext
)

// -------------------
// ------ WASM ------
// -------------------

// Scyclone's funk_drums RAVE model is designed to run with a 16384-sample
// block at 48 kHz (~341 ms). That's what the official JUCE plugin uses
// (see Scyclone/source/dsp/onnx/InferenceThread.h: modelInputSize = 16384).
// Smaller blocks produce incomplete reconstructions and audible artifacts.
const BUFFER_SIZE = 16384
const REALTIME_THRESHOLD_MS = (BUFFER_SIZE / audioContext.sampleRate) * 1000

const res = await fetch('funk_drums.onnx')
if (!res.ok) throw new Error('Failed to load model')
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraWeb.VectorModelData([
  aniraWeb.ModelData(modelBuffer, aniraWeb.InferenceBackend.ONNX),
])

// Input: [1, 1, BUFFER_SIZE], Output: [1, 1, BUFFER_SIZE]
const inputShapeList = aniraWeb.TensorShapeList([[1, 1, BUFFER_SIZE]])
const outputShapeList = aniraWeb.TensorShapeList([[1, 1, BUFFER_SIZE]])
const tensorShape = aniraWeb.TensorShape(inputShapeList, outputShapeList)
const vectorTensorShape = aniraWeb.VectorTensorShape([tensorShape])

// Mono in, mono out, one block per inference.
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
  REALTIME_THRESHOLD_MS,
  2,
  false,
  0,
  1
)

const ppProcessor = aniraWeb.PrePostProcessor(inferenceConfig)

const hostAudioConfig = aniraWeb.HostConfig(128, 44100, false, 0)
const inferenceHandler = aniraWeb.InferenceHandler(ppProcessor, inferenceConfig)
inferenceHandler.setInferenceBackend(aniraWeb.InferenceBackend.ONNX)
inferenceHandler.prepare(hostAudioConfig)

// --------------------
// ------ Audio -------
// --------------------

await aniraWeb.registerAudioWorkletForContext(audioContext)
const inferenceNode = await aniraWeb.configureAudioWorklet(
  audioContext,
  inferenceHandler,
  ppProcessor,
  undefined,
  { inputChannels: 1, outputChannels: 1, maxBufferSize: BUFFER_SIZE }
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

removeLoadingIndicator()
console.log('Scyclone funk_drums demo initialized!')
