import { loadGuitarLstm } from './setup'
import { createAudioContext } from '../utils/audioContext'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('guitar.mp3')
const audioContext = createAudioContext(44100)

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadGuitarLstm()

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  context: demo.context,
  // The first Play, on the running context: the chain and the graph.
  start: async () => {
    const chain = await demo.start(audioContext)
    const sourceNode = audioContext.createMediaElementSource(audio)
    const dry = connectDryWet(audioContext, sourceNode, chain.audioNode.node)
    return { getLatency: chain.getLatency, remeasure: chain.remeasure, dry }
  },
})

removeLoadingIndicator()
console.log('GuitarLSTM demo initialized!')
