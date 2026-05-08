import { AniraWeb } from '@anira-project/anira'
import { setupDemoUI } from '../utils/setupDemoUI'
import { setupControls } from './controls'

// -------------------------------------------------------------------------
// Boot
// -------------------------------------------------------------------------

const aniraWeb = await AniraWeb.create()
// Two inference workers so the two RAVE models can run in parallel.
await aniraWeb.spinUpInferenceWorker()
await aniraWeb.spinUpInferenceWorker()

const audio = new Audio('drumloop.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const { removeLoadingIndicator } = await setupDemoUI(aniraWeb, audio, audioContext)

// -------------------------------------------------------------------------
// Inference setup (one InferenceHandler per RAVE model)
// -------------------------------------------------------------------------

// Both RAVE models are designed for 16384-sample blocks at 48 kHz.
const BUFFER_SIZE = 16384
const REALTIME_THRESHOLD_MS = (BUFFER_SIZE / audioContext.sampleRate) * 1000

async function buildInferenceNode(modelPath: string) {
  const res = await fetch(modelPath)
  if (!res.ok) throw new Error(`Failed to load model ${modelPath}`)
  const modelBuffer = await res.arrayBuffer()

  const vectorModelData = aniraWeb.VectorModelData([
    aniraWeb.ModelData(modelBuffer, aniraWeb.InferenceBackend.ONNX),
  ])

  const inputShapeList = aniraWeb.TensorShapeList([[1, 1, BUFFER_SIZE]])
  const outputShapeList = aniraWeb.TensorShapeList([[1, 1, BUFFER_SIZE]])
  const tensorShape = aniraWeb.TensorShape(inputShapeList, outputShapeList)
  const vectorTensorShape = aniraWeb.VectorTensorShape([tensorShape])

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
  const hostAudioConfig = aniraWeb.HostConfig(128, audioContext.sampleRate, false, 0)
  const inferenceHandler = aniraWeb.InferenceHandler(ppProcessor, inferenceConfig)
  inferenceHandler.setInferenceBackend(aniraWeb.InferenceBackend.ONNX)
  inferenceHandler.prepare(hostAudioConfig)

  const node = await aniraWeb.configureAudioWorklet(
    audioContext,
    inferenceHandler,
    ppProcessor,
    undefined,
    { inputChannels: 1, outputChannels: 1, maxBufferSize: BUFFER_SIZE }
  )

  return { node, latencySamples: inferenceHandler.getLatency() }
}

await aniraWeb.registerAudioWorkletForContext(audioContext)

const { node: inferenceNode1, latencySamples: latency1 } =
  await buildInferenceNode('funk_drums.onnx')
const { node: inferenceNode2, latencySamples: latency2 } =
  await buildInferenceNode('djembe.onnx')

// -------------------------------------------------------------------------
// Audio graph
// -------------------------------------------------------------------------
//
//   source ─┬─► dryDelay ──────────────────────────────► dryGain ─┐
//           │                                                       ├─► dest
//           └─► inputGain ─┬─► inferenceNode1 ─► fadeGain1 ─┐     │
//                          └─► inferenceNode2 ─► fadeGain2 ─┴─► wetGain ─┘

const sourceNode = audioContext.createMediaElementSource(audio)

// Delay the dry path to align with model latency (~341 ms at 48 kHz).
const dryLatencySamples = Math.max(latency1, latency2)
const dryDelay = audioContext.createDelay(2)
dryDelay.delayTime.value = dryLatencySamples / audioContext.sampleRate

const dryGain = audioContext.createGain()
const wetGain = audioContext.createGain()

// Stereo → mono downmix before the models.
const inputGain = audioContext.createGain()
inputGain.channelCount = 1
inputGain.channelCountMode = 'explicit'
inputGain.channelInterpretation = 'speakers'

const fadeGain1 = audioContext.createGain()
const fadeGain2 = audioContext.createGain()

sourceNode.connect(dryDelay).connect(dryGain).connect(audioContext.destination)
sourceNode.connect(inputGain)
inputGain.connect(inferenceNode1).connect(fadeGain1).connect(wetGain)
inputGain.connect(inferenceNode2).connect(fadeGain2).connect(wetGain)
wetGain.connect(audioContext.destination)

// -------------------------------------------------------------------------
// Parameter state + UI
// -------------------------------------------------------------------------

setupControls(
  { audioContext, inputGain, fadeGain1, fadeGain2, dryGain, wetGain },
  document.getElementById('controls')!
)

removeLoadingIndicator()
console.log('RAVE dual-model demo initialised.')
