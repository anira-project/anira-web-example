import { createGuitarLstm } from './setup'
import { InferenceThreads } from '../utils/inferenceThreads'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('guitar.mp3')
const audioContext = new AudioContext({ sampleRate: 44100 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createGuitarLstm(audioContext)

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

removeLoadingIndicator()
console.log('GuitarLSTM demo initialized!')
