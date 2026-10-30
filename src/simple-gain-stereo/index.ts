import { loadSimpleGainStereo } from './setup'
import { createAudioContext } from '../utils/audioContext'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = createAudioContext(48000)

// -------------------
// ------ anira ------
// -------------------

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadSimpleGainStereo()

// --------------------
// ------ Audio -------
// --------------------

const gainSlider = document.getElementById('gain-slider')! as HTMLInputElement
const gainValue = document.getElementById('gain-value')!

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  // The first Play, on the running context: the chain, the pool, the graph.
  start: async () => {
    const chain = await demo.start(audioContext)
    await demo.context.ready() // the pool's Wasm Workers start once this thread yields
    console.log(`inference threads: ${demo.context.threads}`)
    chain.gain.value = parseFloat(gainSlider.value)

    // The slider drives the gain's AudioParam; the node hands the model each quantum's value.
    gainSlider.oninput = () => {
      const val = parseFloat(gainSlider.value)
      gainValue.textContent = val.toFixed(2)
      chain.gain.setTargetAtTime(val, audioContext.currentTime, 0.01)
    }

    const sourceNode = audioContext.createMediaElementSource(audio)
    const dry = connectDryWet(audioContext, sourceNode, chain.audioNode.node)
    return { latency: chain.latency, remeasure: chain.remeasure, dry }
  },
})

gainSlider.oninput = () =>
  (gainValue.textContent = parseFloat(gainSlider.value).toFixed(2))

removeLoadingIndicator()
console.log('Demo initialized and ready!')
