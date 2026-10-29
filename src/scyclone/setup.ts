import {
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
import { QUANTUM, renderBurst } from '../utils/renderBurst'

/** One RAVE model's stream: its audio node and its handler's latency in samples. */
export type RaveStream = {
  audioNode: AniraAudioNode
  latency: number
}

export type Scyclone = {
  anira: Anira
  context: Context
  funk: RaveStream
  djembe: RaveStream
  teardown: () => void
}

/**
 * The demo's anira chain on `audioContext`: two RAVE models (funk drums, djembe), each a handler
 * of its own on one context, mono, on the built-in ONNX Runtime engine, up to their two audio
 * nodes (the page builds the mix around them). Both models take and yield blocks of 16384
 * samples at 48 kHz. With two inference threads the two run in parallel. `waitMs` lets each
 * quantum wait for its inference (an offline render).
 */
export async function createScyclone(
  audioContext: BaseAudioContext,
  { waitMs = 0 } = {}
): Promise<Scyclone> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. One context for both handlers, without a pool: the page starts its inference threads.
  const context = Context.create(anira, { threads: 0 })

  // 3. One handler per model config, both under the same contract file: 341.3 ms per inference
  //    (16384 samples at 48 kHz), 2 warm-up runs; the geometry is the render quantum.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const handlers: Handler[] = []
  const models: ModelConfig[] = []
  const build = async (configFile: string): Promise<RaveStream> => {
    const model = await ModelConfig.fromUrl(anira, new URL(configFile, site))
    models.push(model)
    const contract = (
      await Contract.fromUrl(anira, new URL('rave.contract.json', site))
    ).setGeometry(QUANTUM, renderBurst(audioContext), audioContext.sampleRate)
    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = Handler.create(context, pipeline).prepare(contract)
    handlers.push(handler)
    pipeline.destroy()
    contract.destroy()
    const latency = handler.latency()
    console.log(`${configFile}: latency ${latency} samples`)

    // 4. The handler's audio node: mono in and out.
    const audioNode = await handler.createAudioNode(audioContext, {
      inputChannels: 1,
      outputChannels: 1,
      waitMs,
    })
    return { audioNode, latency }
  }
  const funk = await build('funk-drums.model.json')
  const djembe = await build('djembe.model.json')

  // 5. The teardown, in reverse: the nodes stop calling their handlers first.
  const teardown = () => {
    for (const { audioNode } of [funk, djembe]) {
      audioNode.node.disconnect()
      audioNode.destroy()
    }
    for (const handler of handlers) handler.destroy()
    for (const model of models) model.destroy()
    context.destroy()
    stopLogPump()
  }
  return { anira, context, funk, djembe, teardown }
}
