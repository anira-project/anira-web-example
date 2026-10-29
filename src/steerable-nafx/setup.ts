import {
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
  renderBurstFrames,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'

/** The render quantum: one handler call per quantum. */
const QUANTUM = 128

export type SteerableNafx = {
  anira: Anira
  context: Context
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  latency: number
  teardown: () => void
}

/**
 * The demo's anira chain on `audioContext`, up to the handler's audio node: the 2-block
 * Steerable-NAFX CNN on the built-in ONNX Runtime engine, mono. Its receptive field is the
 * model config's overlap: each inference takes 1156 samples, the 132 of the previous window
 * and 1024 new ones, and yields 1024. No stage and no worklet module: the windowing that the
 * 2.x demo wrote in JavaScript in its audio worklet is the declared window. `waitMs` lets each
 * quantum wait for its inference (an offline render).
 */
export async function createSteerableNafx(
  audioContext: BaseAudioContext,
  { waitMs = 0 } = {}
): Promise<SteerableNafx> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
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
  const contract = (
    await Contract.fromUrl(anira, new URL('steerable-nafx.contract.json', site))
  ).setGeometry(QUANTUM, renderBurstFrames(audioContext), audioContext.sampleRate)

  // 4. The pipeline and the handler.
  const pipeline = Pipeline.create(anira).addInference(model)
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy()
  contract.destroy()
  const latency = handler.latency()
  console.log(`latency: ${latency} samples`)

  // 5. The audio node: mono in and out.
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
