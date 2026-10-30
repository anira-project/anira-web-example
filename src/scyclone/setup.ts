import {
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'

/** One RAVE model's stream: its audio node and its handler's latency in samples. */
export type RaveStream = {
  audioNode: AniraAudioNode
  latency: () => number
}

/** The two streams on a running context: what `start` returns. */
export type ScycloneChain = {
  funk: RaveStream
  djembe: RaveStream
  /** The larger of the two latencies: what the dry path waits for, in samples. */
  latency: () => number
  /** Measure the context's render geometry again and re-prepare both running nodes. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the two streams on a context. */
export type Scyclone = {
  anira: Anira
  context: Context
  start: (
    audioContext: BaseAudioContext,
    options?: { waitMs?: number }
  ) => Promise<ScycloneChain>
}

/**
 * The demo's anira chain: two RAVE models (funk drums, djembe), each a handler of its own on one
 * context, mono, on the built-in ONNX Runtime engine, up to their two audio nodes (the page
 * builds the mix around them). Both models take and yield blocks of 16384 samples at 48 kHz.
 * With two or more inference threads the two run in parallel. Loading needs no audio; `start`
 * needs a running context (a live one is measured: `await audioContext.resume()` first).
 * `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadScyclone(): Promise<Scyclone> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context with the default pool of inference threads (Wasm Workers). The built-in
  //    engine needs no worker module. Two threads run the two models in parallel; one runs
  //    them in turn, which fits the budget where an inference takes under half of it (measured
  //    on one thread: about 17 ms per inference in Chromium, 146 ms in Firefox, against
  //    341.3 ms). A slower machine with one thread misses.
  const context = Context.create(anira)

  // 3. The configs, one per model, both under the same contract file: 341.3 ms per inference
  //    (16384 samples at 48 kHz), 2 warm-up runs.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const models = [
    await ModelConfig.fromUrl(anira, new URL('funk-drums.model.json', site)),
    await ModelConfig.fromUrl(anira, new URL('djembe.model.json', site)),
  ]
  const contract = await Contract.fromUrl(anira, new URL('rave.contract.json', site))

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // 4. The geometry, measured on the running context: one render quantum per call, blocks up
    //    to the burst it renders back to back, so the latency each handler reports covers it.
    const geometry = await measureRenderGeometry(audioContext)
    contract.setGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // 5. One handler per model, both prepared under the contract (each copies it), and its
    //    audio node: mono in and out. An offline render waits for its inferences: the pool
    //    first.
    const handlers = models.map((model) => {
      const pipeline = Pipeline.create(anira).addInference(model)
      const handler = Handler.create(context, pipeline).prepare(contract)
      pipeline.destroy()
      return handler
    })
    if (waitMs > 0) await context.ready()
    const [funk, djembe] = await Promise.all(
      handlers.map(async (handler): Promise<RaveStream> => {
        const audioNode = await handler.createAudioNode(audioContext, { waitMs })
        return { audioNode, latency: () => handler.latency() }
      })
    )
    const latency = () => Math.max(funk.latency(), djembe.latency())
    console.log(`latency: ${funk.latency()} and ${djembe.latency()} samples`)

    // 6. After an output-device change: measure again, holding both running nodes meanwhile
    //    (silent, so their rendering does not hide the device's callbacks from the probe),
    //    and re-prepare them for the new geometry.
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, {
        hold: [funk.audioNode, djembe.audioNode],
      })
      contract.setGeometry(g.quantum, g.burst, audioContext.sampleRate)
      for (const { audioNode } of [funk, djembe]) audioNode.prepare(contract)
      console.log(`latency: ${funk.latency()} and ${djembe.latency()} samples`)
    }

    // 7. The teardown, in reverse: the nodes stop calling their handlers first.
    const teardown = () => {
      for (const { audioNode } of [funk, djembe]) {
        audioNode.node.disconnect()
        audioNode.destroy()
      }
      for (const handler of handlers) handler.destroy()
      contract.destroy()
      for (const model of models) model.destroy()
      context.destroy()
      stopLogPump()
    }
    return { funk, djembe, latency, remeasure, teardown }
  }
  return { anira, context, start }
}
