import { createJsCopying } from './setup'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = new AudioContext({ sampleRate: 48000 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createJsCopying(audioContext)

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

removeLoadingIndicator()
console.log('Demo initialized and ready!')
