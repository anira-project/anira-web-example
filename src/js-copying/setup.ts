import {
  ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL,
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
// The engine's id from the worker module, which itself runs in each inference Worker.
import { JS_COPY_ENGINE } from './worker'
import workerModule from './worker.ts?worker&url'

/** The chain on a running context: what `start` returns. */
export type JsCopyingChain = {
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  getLatency: () => number
  /** Measure the context's render geometry again and re-prepare the running node. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the chain on a context. */
export type JsCopying = {
  anira: Anira
  context: Context
  start: (
    audioContext: BaseAudioContext,
    options?: { waitMs?: number }
  ) => Promise<JsCopyingChain>
}

/**
 * The demo's anira chain: the stereo tensors of Simple Gain Stereo, run by a JavaScript engine
 * (JSCopyEngine, defined in worker.ts) that copies its inputs through sample by sample, with
 * no model file.
 * Loading needs no audio; `start` needs a running context (a live one is measured:
 * `await audioContext.resume()` first) and builds the chain up to the handler's audio node.
 * `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadJsCopying(): Promise<JsCopying> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // 2. A context with the default pool of inference threads (Wasm Workers), each of which
  //    imports the worker module first: the engine is defined there, not here.
  const context = Context.create(anira, { workerModule })

  // 3. The configs: the model entry names the engine and no model file, legal for an engine
  //    that declares ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL (step 5); the contract is Simple Gain
  //    Stereo's.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('js-copy-stereo.model.json', site)
  )
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('simple-gain-stereo.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // 4. The geometry, measured on the running context: one render quantum per call, blocks up
    //    to the burst it renders back to back, so the latency the handler reports covers it.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // 5. The pipeline registers the engine under its id, promising it reads no model file.
    const pipeline = Pipeline.create(anira)
      .inference(model)
      .registerEngine(JS_COPY_ENGINE, { flags: ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL })
    const handler = InferenceHandler.create(context, pipeline)
    const report = handler.prepare(contract) // the plans this prepare compiled
    for (const plan of report.plans()) {
      console.log(`plan: engine ${plan.engine}, ${plan.budgetMs} ms budget`)
    }
    pipeline.destroy()
    console.log(`latency: ${handler.getLatency()} samples`)

    // 6. The audio node: stereo in and out. An offline render waits for its inferences:
    //    the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = await handler.createAudioNode(audioContext, { waitMs })

    // 7. After an output-device change: measure again, holding the running node meanwhile
    //    (silent, so its rendering does not hide the device's callbacks from the probe), and
    //    re-prepare it for the new geometry (it holds off while the handler re-prepares).
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)
      audioNode.prepare(contract)
      console.log(`latency: ${handler.getLatency()} samples`)
    }

    // 8. The teardown, in reverse: the node stops calling the handler first.
    const teardown = () => {
      audioNode.node.disconnect()
      audioNode.destroy()
      handler.destroy()
      contract.destroy()
      model.destroy()
      context.destroy()
      stopLogPump()
    }
    return { audioNode, getLatency: () => handler.getLatency(), remeasure, teardown }
  }
  return { anira, context, start }
}
