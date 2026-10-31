import {
  ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL,
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  anira_engine,
  measureRenderGeometry,
} from '@anira-project/anira'
// The engine's id from the worker module, which itself runs in each inference Worker.
import { PASSTHROUGH_ENGINE } from './worker'
import workerModule from './worker.ts?worker&url'

/**
 * The demo's anira chain: the stereo tensors of Simple Gain Stereo, run by a JavaScript engine
 * (worker.ts) that passes its inputs through, with no model file.
 * Loading needs no audio; `start` builds the chain on a running context (a live one is
 * measured) up to the handler's audio node, which the page connects. `waitMs` lets each quantum
 * wait for its inference (an offline render).
 */
export async function loadJsCallback() {
  // The module on this thread. Its shared WebAssembly memory starts at 256 MiB and grows as the
  // models need (Anira.create's `memory` option sizes it).
  const anira = await Anira.create()
  // Its log, to the console. The web has no log drain thread: the pump delivers the records the
  // real-time threads queue.
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // The context without a pool (threads: 0): the page starts and stops its own inference
  // threads (index.ts), each a Wasm Worker that imports the worker module, where the engine is
  // defined. A pool's size is fixed when it is created; these threads come and go.
  const context = Context.create(anira, { threads: 0, workerModule })

  // The model entry names the engine and no model file, legal for an engine that declares
  // ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL (start); the contract is Simple Gain Stereo's.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('passthrough-stereo.model.json', site)
  )
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('simple-gain-stereo.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // The geometry: one render quantum per process call, and blocks up to the burst a live
    // context renders back to back (a device callback's worth of quanta), measured on the
    // running context. The contract gets it, so the latency the handler reports covers a burst.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // The pipeline: the inference stage and the JavaScript engine under its id, which promises
    // to read no model file.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addEngine(PASSTHROUGH_ENGINE, { flags: ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL })
    const handler = InferenceHandler.create(context, pipeline)
    pipeline.destroy() // the handler copied it

    // prepare compiles the plans under the contract and returns the report of them: one plan per
    // model entry the build can run, with its engine (a JavaScript engine by its id, a built-in
    // one by its anira_engine name) and its budget.
    const report = handler.prepare(contract)
    for (const plan of report.plans()) {
      const engine =
        plan.engineId ??
        Object.entries(anira_engine).find(([, value]) => value === plan.engine)?.[0]
      console.log(`plan: ${engine}, ${plan.budgetMs} ms budget`)
    }
    // The latency: how many samples later the output answers the input.
    console.log(`latency: ${handler.getLatency()} samples`)

    // No pool to wait for: the page's own threads run the queue (index.ts).

    // The audio node: a Web Audio input and output per Streamed slot of the model (stereo).
    const audioNode = await handler.createAudioNode(audioContext, { waitMs })

    // After an output-device change (the page's sinkchange): measure again with the running node
    // held (silent, so its rendering does not hide the device's callbacks from the probe), give
    // the contract the new geometry and re-prepare the node, which holds off (silence) while its
    // handler re-prepares.
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)
      const again = audioNode.prepare(contract) // the report of the new prepare
      console.log(
        `re-prepared: ${again.numPlans()} plan(s), latency ${handler.getLatency()} samples`
      )
    }

    // The teardown, in reverse order of creation: the node stops calling the handler first. C
    // objects are freed by destroy, never by the garbage collector.
    const teardown = () => {
      audioNode.node.disconnect()
      audioNode.destroy()
      handler.destroy()
      contract.destroy()
      model.destroy()
      context.destroy() // the last context stops the pool
      stopLogPump()
    }
    return {
      audioNode,
      getLatency: () => handler.getLatency(),
      remeasure,
      teardown,
    }
  }
  return { anira, context, start }
}
