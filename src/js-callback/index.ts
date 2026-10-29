import { createJsCallback } from './setup'
import { InferenceThreads } from '../utils/inferenceThreads'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createJsCallback(audioContext)

// One inference thread to start with: a Wasm Worker that imports the worker module (the
// engine is defined there), then runs the context's queue.
const threads = new InferenceThreads(demo.anira, demo.context)
threads.add()

// --------------------
// ------ Audio -------
// --------------------

const { removeLoadingIndicator, connectAudioGraph } = setupDemoUI(
  audio,
  audioContext,
  threads
)

const sourceNode = audioContext.createMediaElementSource(audio)
connectAudioGraph(sourceNode, demo.audioNode.node)

removeLoadingIndicator()
console.log('Demo initialized and ready!')
