import { loadStreamingGainStereo } from './setup'
import { createAudioContext } from '../utils/audioContext'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = createAudioContext(48000)

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadStreamingGainStereo()

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  // The first Play, on the running context: the chain and the graph.
  start: async () => {
    const chain = await demo.start(audioContext)

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
    return { getLatency: chain.getLatency, remeasure: chain.remeasure, dry }
  },
})

removeLoadingIndicator()
console.log('Demo initialized and ready!')
