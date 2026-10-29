import { createStreamingGainStereo } from './setup'
import { InferenceThreads } from '../utils/inferenceThreads'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createStreamingGainStereo(audioContext)

// One inference thread to start with: a Wasm Worker running the context's queue.
const threads = new InferenceThreads(demo.anira, demo.context)
threads.add()

// --------------------
// ------ Audio -------
// --------------------

const { removeLoadingIndicator, connectAudioGraph } = setupDemoUI(
  threads,
  audio,
  audioContext
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, demo.audioNode.node)

// The gain stream: a 1 Hz LFO, scaled and offset into [0.5, 2.0], one value per sample into the
// node's second input. Its second output (the model's gain_out) goes nowhere.
const lfo = new OscillatorNode(audioContext, { frequency: 1 })
const depth = new GainNode(audioContext, { gain: 0.75 })
const offset = new ConstantSourceNode(audioContext, { offset: 1.25 })
lfo.connect(depth).connect(demo.audioNode.node, 0, 1)
offset.connect(demo.audioNode.node, 0, 1)
lfo.start()
offset.start()

removeLoadingIndicator()
console.log('Demo initialized and ready!')
