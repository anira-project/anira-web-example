import { createOnnxRuntimeWebBackend } from './setup'
import { InferenceThreads } from '../utils/inferenceThreads'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createOnnxRuntimeWebBackend(audioContext)

// One inference thread to start with: a Wasm Worker that imports the worker module (the
// engine's init loads onnxruntime-web and the model there), then runs the context's queue.
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

// -------------------
// ------- UI --------
// -------------------

const gainSlider = document.getElementById('gain-slider')! as HTMLInputElement
const gainValue = document.getElementById('gain-value')!

// The slider drives the gain's AudioParam; the node hands the model each quantum's value.
gainSlider.oninput = () => {
  const val = parseFloat(gainSlider.value)
  gainValue.textContent = val.toFixed(2)
  demo.gain.setTargetAtTime(val, audioContext.currentTime, 0.01)
}

removeLoadingIndicator()
console.log('Demo initialized and ready!')
