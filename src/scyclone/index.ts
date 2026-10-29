import { createScyclone } from './setup'
import { setupControls } from './controls'
import { setupDemoUI } from '../utils/setupDemoUI'

// -------------------------------------------------------------------------
// Boot
// -------------------------------------------------------------------------

const audio = new Audio('drumloop.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

const demo = await createScyclone(audioContext)

// The context's pool: its Wasm Workers start once this thread yields; the page is ready once
// they are in their loops.
await demo.context.ready()
console.log(`inference threads: ${demo.context.threads}`)

const { removeLoadingIndicator } = setupDemoUI(audio, audioContext)

// -------------------------------------------------------------------------
// Audio graph
// -------------------------------------------------------------------------
//
//   source ─┬─► dryDelay ──────────────────────────────► dryGain ─┐
//           │                                                       ├─► dest
//           └─► inputGain ─┬─► funk node ───► fadeGain1 ─┐         │
//                          └─► djembe node ─► fadeGain2 ─┴─► wetGain ─┘

const sourceNode = audioContext.createMediaElementSource(audio)

// Delay the dry path to align with the models' latency (handler.latency(), in samples).
const dryLatencySamples = Math.max(demo.funk.latency, demo.djembe.latency)
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
inputGain.connect(demo.funk.audioNode.node).connect(fadeGain1).connect(wetGain)
inputGain.connect(demo.djembe.audioNode.node).connect(fadeGain2).connect(wetGain)
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
