import { loadRave } from './setup'
import { setupControls } from './controls'
import { createAudioContext } from '../utils/audioContext'
import { setupDemoUI } from '../utils/setupDemoUI'

// The realtime inference workshop's demo input: slow synthesized chords, the kind of sound the
// magnetic resonator piano model was trained on (on drums it mostly falls silent).
const audio = new Audio('chords.wav')
// The model is trained at 44.1 kHz: the context runs at its rate.
const audioContext = createAudioContext(44100)

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadRave()

// The graph:
//   source ─┬─► dryDelay ─────────────────────► dryGain ─┐
//           │                                            ├─► destination
//           └─► inputGain ─► RAVE node ─────► wetGain ──┘

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  // The first Play, on the running context: the chain and the graph.
  start: async () => {
    const chain = await demo.start(audioContext)

    const sourceNode = audioContext.createMediaElementSource(audio)

    // The dry path waits for the model: setupDemoUI sets the delay to the handler's latency,
    // now and after a re-prepare.
    const dryDelay = new DelayNode(audioContext, { maxDelayTime: 2 })
    const dryGain = audioContext.createGain()
    const wetGain = audioContext.createGain()

    // Stereo → mono downmix before the model.
    const inputGain = audioContext.createGain()
    inputGain.channelCount = 1
    inputGain.channelCountMode = 'explicit'
    inputGain.channelInterpretation = 'speakers'

    sourceNode.connect(dryDelay).connect(dryGain).connect(audioContext.destination)
    sourceNode.connect(inputGain).connect(chain.audioNode.node).connect(wetGain)
    wetGain.connect(audioContext.destination)

    // The input-gain and mix controls.
    setupControls(
      { audioContext, inputGain, dryGain, wetGain },
      document.getElementById('controls')!
    )
    return { getLatency: chain.getLatency, remeasure: chain.remeasure, dry: dryDelay }
  },
})

removeLoadingIndicator()
console.log('RAVE demo initialised.')
