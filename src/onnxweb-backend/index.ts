import { createOnnxRuntimeWebBackend } from './setup'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createOnnxRuntimeWebBackend(audioContext)

// The context's pool: its Wasm Workers start once this thread yields; the page is ready once
// they are in their loops.
await demo.context.ready()
console.log(`inference threads: ${demo.context.threads}`)

// --------------------
// ------ Audio -------
// --------------------

const { removeLoadingIndicator, connectAudioGraph } = setupDemoUI(audio, audioContext)

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
