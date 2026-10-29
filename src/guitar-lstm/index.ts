import { createGuitarLstm } from './setup'
import { setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('guitar.mp3')
const audioContext = new AudioContext({ sampleRate: 44100 })

// -------------------
// ------ anira ------
// -------------------

const demo = await createGuitarLstm(audioContext)

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
console.log('GuitarLSTM demo initialized!')
