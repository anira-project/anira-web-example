import { loadJsCallback } from './setup'
import { createAudioContext } from '../utils/audioContext'
import { connectDryWet, setupDemoUI } from '../utils/setupDemoUI'

const audio = new Audio('vibes.mp3')
const audioContext = createAudioContext(48000)

// At load: the module, the context and the configs. The chain waits for the first Play.
const demo = await loadJsCallback()

// The page's own inference threads, on the context without a pool: each an
// anira_inference_thread that anira runs as a Wasm Worker on the module's memory, which imports
// the context's worker module (the engine is defined there) and then runs the context's queue.
// The classes of the package do not wrap these: the calls are the C entries, typed, on
// anira.abi.
const { abi } = demo.anira
const threads: number[] = []
const addThread = () => {
  const thread = abi.anira_inference_thread_create(demo.context.native())
  abi.anira_inference_thread_start(thread)
  threads.push(thread)
}
// Stop the newest thread: an inference it took completes first; destroy it once its Worker left
// the loop (stop terminates a Worker still importing its module, which never runs the loop).
const removeThread = async () => {
  const thread = threads.pop()
  if (thread === undefined) return
  abi.anira_inference_thread_stop(thread)
  while (
    abi.anira_inference_thread_is_running(thread) &&
    !abi.anira_inference_thread_has_exited(thread)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  abi.anira_inference_thread_destroy(thread)
}
// One to start with; + / − Worker add and remove more.
addThread()

const { removeLoadingIndicator } = setupDemoUI({
  audio,
  audioContext,
  threads: {
    get count() {
      return threads.length
    },
    add: addThread,
    remove: removeThread,
  },
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
