import { loadScyclone } from './setup'
import { setupControls } from './controls'
import { createAudioContext } from '../utils/audioContext'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('drumloop.mp3')
const audioContext = createAudioContext(48000)

// At load: the module, the context and the configs. The two streams wait for the first Play.
const demo = await loadScyclone()

// The graph:
//   source ─┬─► dryDelay ──────────────────────────────► dryGain ─┐
//           │                                                       ├─► dest
//           └─► inputGain ─┬─► funk node ───► fadeGain1 ─┐         │
//                          └─► djembe node ─► fadeGain2 ─┴─► wetGain ─┘

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  context: demo.context,
  // The first Play, on the running context: the two streams and the graph.
  start: async () => {
    const chain = await demo.start(audioContext)

    const sourceNode = audioContext.createMediaElementSource(audio)

    // The dry path waits for the slower model: setupDemoUI sets the delay to chain.getLatency(),
    // the larger of the two handlers' latencies, now and after a re-prepare.
    const dryDelay = new DelayNode(audioContext, { maxDelayTime: 2 })

    const dryGain = audioContext.createGain()
    const wetGain = audioContext.createGain()

    // Stereo → mono downmix before the models.
    const inputGain = audioContext.createGain()
    inputGain.channelCount = 1
    inputGain.channelCountMode = 'explicit'
    inputGain.channelInterpretation = 'speakers'

    const fadeGain1 = audioContext.createGain()
    const fadeGain2 = audioContext.createGain()

    sourceNode.connect(dryDelay).connect(dryGain).connect(audioContext.destination)
    sourceNode.connect(inputGain)
    inputGain.connect(chain.funk.audioNode.node).connect(fadeGain1).connect(wetGain)
    inputGain.connect(chain.djembe.audioNode.node).connect(fadeGain2).connect(wetGain)
    wetGain.connect(audioContext.destination)

    // The fade, mix and input-gain controls.
    setupControls(
      { audioContext, inputGain, fadeGain1, fadeGain2, dryGain, wetGain },
      document.getElementById('controls')!
    )
    return { getLatency: chain.getLatency, remeasure: chain.remeasure, dry: dryDelay }
  },
})

removeLoadingIndicator()
console.log('RAVE dual-model demo initialised.')
