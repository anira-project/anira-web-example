import {
  ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL,
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
  renderBurstFrames,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
// The engine's id from its module; the module itself runs in each inference Worker.
import { PASSTHROUGH_ENGINE } from './worker'
import workerModule from './worker.ts?worker&url'

/** The render quantum: one handler call per quantum. */
const QUANTUM = 128

export type JsCallback = {
  anira: Anira
  context: Context
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  latency: number
  teardown: () => void
}

/**
 * The demo's anira chain on `audioContext`, up to the handler's audio node: the stereo tensors
 * of Simple Gain Stereo, run by a JavaScript engine (worker.ts) that passes its inputs through,
 * with no model file. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function createJsCallback(
  audioContext: BaseAudioContext,
  { waitMs = 0 } = {}
): Promise<JsCallback> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context without a pool (the page starts its inference threads), each of whose Workers
  //    imports the worker module, where the engine is defined.
  const context = Context.create(anira, { threads: 0, workerModule })

  // 3. The configs: the model entry names the engine and no model file, legal for an engine
  //    that declares ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL (step 4); the contract is Simple Gain
  //    Stereo's.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('passthrough-stereo.model.json', site)
  )
  const contract = (
    await Contract.fromUrl(anira, new URL('simple-gain-stereo.contract.json', site))
  ).setGeometry(QUANTUM, renderBurstFrames(audioContext), audioContext.sampleRate)

  // 4. The pipeline registers the engine under its id, promising it reads no model file.
  const pipeline = Pipeline.create(anira)
    .addInference(model)
    .registerEngine(PASSTHROUGH_ENGINE, { flags: ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL })
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy()
  contract.destroy()
  const latency = handler.latency()
  console.log(`latency: ${latency} samples`)

  // 5. The audio node: stereo in and out.
  const audioNode = await handler.createAudioNode(audioContext, {
    waitMs,
  })

  // 6. The teardown, in reverse: the node stops calling the handler first.
  const teardown = () => {
    audioNode.node.disconnect()
    audioNode.destroy()
    handler.destroy()
    model.destroy()
    context.destroy()
    stopLogPump()
  }
  return { anira, context, audioNode, latency, teardown }
}
