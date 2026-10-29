import { createGainClamp } from './setup'
import { InferenceThreads } from '../utils/inferenceThreads'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createGainClamp(audioContext)

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

// -------------------
// ------- UI --------
// -------------------

const gainSlider = document.getElementById('gain-slider')! as HTMLInputElement
const gainValue = document.getElementById('gain-value')!

// The slider drives the gain's AudioParam, raw; the stage clamps what reaches the model to at
// most 1.0 in its pre_process, on the audio thread.
gainSlider.oninput = () => {
  const val = parseFloat(gainSlider.value)
  gainValue.textContent = val.toFixed(2)
  demo.gain.setTargetAtTime(val, audioContext.currentTime, 0.01)
}

removeLoadingIndicator()
console.log('Demo initialized and ready!')
