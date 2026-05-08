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

const res = await fetch('streaming-gain-stereo.onnx')
if (!res.ok) {
  throw new Error('Failed to load model')
}
const modelBuffer = await res.arrayBuffer()

const vectorModelData = aniraWeb.VectorModelData([
  aniraWeb.ModelData(modelBuffer, aniraWeb.InferenceBackend.ONNX),
])

const inputShapeList = aniraWeb.TensorShapeList([
  [1, 2, 512],
  [1, 1, 512],
])
const outputShapeList = aniraWeb.TensorShapeList([
  [1, 2, 512],
  [1, 1, 512],
])
const tensorShape = aniraWeb.TensorShape(inputShapeList, outputShapeList)
const vectorTensorShape = aniraWeb.VectorTensorShape([tensorShape])

const preprocessChannels = aniraWeb.VectorSizeT([2, 1])
const postprocessChannels = aniraWeb.VectorSizeT([2, 1])
const preprocessSize = aniraWeb.VectorSizeT([512, 512])
const postprocessSize = aniraWeb.VectorSizeT([512, 512])

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

const ppProcessor = aniraWeb.PrePostProcessor(inferenceConfig)

const hostAudioConfig = aniraWeb.HostConfig(128, 48000, false, 0)
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
  'streaming-gain-stereo',
  {
    inputChannels: 3,
    outputChannels: 3,
    // anira uses a 3rd scratch channel for the gain AudioParam; the Web Audio
    // node itself is stereo in / stereo out.
    audioWorkletNodeOptions: {
      channelCount: 2,
      outputChannelCount: [2],
    },
  }
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, inferenceNode)

// LFO: oscillates gain between 0 and 1 at 1 Hz
// OscillatorNode outputs [-1, 1], so shift+scale to [0, 1]
const lfo = audioContext.createOscillator()
lfo.frequency.value = 1
const lfoGain = audioContext.createGain()
lfoGain.gain.value = 0.75 // scale amplitude to 0.75
lfo.connect(lfoGain)
const gainParam = inferenceNode.parameters.get('gain')!
gainParam.value = 1.25 // DC offset: 1.25 ± 0.75 → [0.5, 2.0]
lfoGain.connect(gainParam)
lfo.start()

removeLoadingIndicator()
console.log('Demo initialized and ready!')
