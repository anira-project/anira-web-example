import { loadSteerableNafx } from './setup'
import { createAudioContext } from '../utils/audioContext'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('guitar.mp3')
const audioContext = createAudioContext(44100)

// -------------------
// ------ anira ------
// -------------------

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadSteerableNafx()

// --------------------
// ------ Audio -------
// --------------------

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  // The first Play, on the running context: the chain, the pool, the graph.
  start: async () => {
    const chain = await demo.start(audioContext)
    await demo.context.ready() // the pool's Wasm Workers start once this thread yields
    console.log(`inference threads: ${demo.context.numInferenceThreads()}`)
    const sourceNode = audioContext.createMediaElementSource(audio)
    const dry = connectDryWet(audioContext, sourceNode, chain.audioNode.node)
    return { getLatency: chain.getLatency, remeasure: chain.remeasure, dry }
  },
})

removeLoadingIndicator()
console.log('Steerable-NAFX demo initialized!')
