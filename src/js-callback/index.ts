import { loadJsCallback } from './setup'
import { InferenceThreads } from '../utils/inferenceThreads'
import { createAudioContext } from '../utils/audioContext'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = createAudioContext(48000)

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadJsCallback()

// One inference thread to start with: a Wasm Worker that imports the worker module (the
// engine is defined there), then runs the context's queue.
const threads = new InferenceThreads(demo.anira, demo.context)
threads.add()

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  threads,
  // The first Play, on the running context: the chain and the graph.
  start: async () => {
    const chain = await demo.start(audioContext)
    const sourceNode = audioContext.createMediaElementSource(audio)
    const dry = connectDryWet(audioContext, sourceNode, chain.audioNode.node)
    return { getLatency: chain.getLatency, remeasure: chain.remeasure, dry }
  },
})

removeLoadingIndicator()
console.log('Demo initialized and ready!')
