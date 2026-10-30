import {
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
import { engineName } from '../utils/engineName'

/** The chain on a running context: what `start` returns. */
export type SteerableNafxChain = {
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  getLatency: () => number
  /** Measure the context's render geometry again and re-prepare the running node. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the chain on a context. */
export type SteerableNafx = {
  anira: Anira
  context: Context
  start: (
    audioContext: BaseAudioContext,
    options?: { waitMs?: number }
  ) => Promise<SteerableNafxChain>
}

/**
 * The demo's anira chain: the 2-block Steerable-NAFX CNN on the built-in ONNX Runtime engine,
 * mono. Its receptive field is the model config's overlap: each inference takes 1156 samples,
 * the 132 of the previous window and 1024 new ones, and yields 1024. No stage and no worklet
 * module: the windowing that the 2.x demo wrote in JavaScript in its audio worklet is the
 * declared window. Loading needs no audio; `start` needs a running context (a live one is
 * measured: `await audioContext.resume()` first) and builds the chain up to the handler's audio
 * node. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadSteerableNafx(): Promise<SteerableNafx> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // 2. A context with the default pool of inference threads (Wasm Workers). The built-in
  //    engine needs no worker module.
  const context = Context.create(anira)

  // 3. The configs: the model's window and overlap (public/steerable-nafx.model.json), and the
  //    Hard contract: 23.2 ms per inference (1024 samples at 44.1 kHz, the 2.x real-time
  //    threshold), 2 warm-up runs.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('steerable-nafx.model.json', site)
  )
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('steerable-nafx.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // 4. The geometry, measured on the running context: one render quantum per call, blocks up
    //    to the burst it renders back to back, so the latency the handler reports covers it.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // 5. The pipeline and the handler.
    const pipeline = Pipeline.create(anira).inference(model)
    const handler = InferenceHandler.create(context, pipeline)
    const report = handler.prepare(contract) // the plans this prepare compiled
    for (const plan of report.plans()) {
      console.log(`plan: ${engineName(plan)}, ${plan.budgetMs} ms budget`)
    }
    pipeline.destroy()
    console.log(`latency: ${handler.getLatency()} samples`)

    // 6. The audio node: mono in and out. An offline render waits for its inferences: the pool
    //    first.
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
