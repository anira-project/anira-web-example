import { loadJsCopying } from './setup'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

// At load: the module, the context (its Workers import the worker module) and the configs.
// The chain waits for the first Play.
const demo = await loadJsCopying()

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
    console.log(`inference threads: ${demo.context.threads}`)
    const sourceNode = audioContext.createMediaElementSource(audio)
    const dry = connectDryWet(audioContext, sourceNode, chain.audioNode.node)
    return { latency: chain.latency, remeasure: chain.remeasure, dry }
  },
})

removeLoadingIndicator()
console.log('Demo initialized and ready!')
