import { loadStreamingGainStereo } from './setup'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadStreamingGainStereo()

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

    // The gain stream: a 1 Hz LFO, scaled and offset into [0.5, 2.0], one value per sample into
    // the node's second input. Its second output (the model's gain_out) goes nowhere.
    const lfo = new OscillatorNode(audioContext, { frequency: 1 })
    const depth = new GainNode(audioContext, { gain: 0.75 })
    const offset = new ConstantSourceNode(audioContext, { offset: 1.25 })
    lfo.connect(depth).connect(chain.audioNode.node, 0, 1)
    offset.connect(chain.audioNode.node, 0, 1)
    lfo.start()
    offset.start()
    return { latency: chain.latency, remeasure: chain.remeasure, dry }
  },
})

removeLoadingIndicator()
console.log('Demo initialized and ready!')
