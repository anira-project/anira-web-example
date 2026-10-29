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

/** The chain on a running context: what `start` returns. */
export type StreamingGainStereoChain = {
  /**
   * Streams both: input 0 the stereo audio (slot 0), input 1 the gain, one value per sample
   * (slot 1); output 0 the processed audio, output 1 the model's copy of the gain.
   */
  audioNode: AniraAudioNode
  /** The handler's latency in samples: the output is the input this much later. */
  latency: () => number
  /** Measure the context's render geometry again and re-prepare the running node. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the chain on a context. */
export type StreamingGainStereo = {
  anira: Anira
  context: Context
  start: (
    audioContext: BaseAudioContext,
    options?: { waitMs?: number }
  ) => Promise<StreamingGainStereoChain>
}

/**
 * The demo's anira chain: a stereo gain model whose gain is a second Streamed input, a value per
 * sample, on the built-in ONNX Runtime engine. The node serves every Streamed slot of the model,
 * one Web Audio input and output per slot, and hands them to the handler together each quantum.
 * Loading needs no audio; `start` needs a running context (a live one is measured:
 * `await audioContext.resume()` first) and builds the chain up to the handler's audio node.
 * `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadStreamingGainStereo(): Promise<StreamingGainStereo> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context with the default pool of inference threads (Wasm Workers). The built-in
  //    engine needs no worker module.
  const context = Context.create(anira)

  // 3. The configs: two Streamed inputs (audio, 2 channels; gain, 1 channel) and their two
  //    outputs, windows of 512. The contract's miss policy is zeros: a bypass needs every
  //    output to have the anchored input's channels, and gain_out has one.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('streaming-gain-stereo.model.json', site)
  )
  const contract = await Contract.fromUrl(
    anira,
    new URL('streaming-gain-stereo.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // 4. The geometry, measured on the running context: one render quantum per call, blocks up
    //    to the burst it renders back to back, so the latency the handler reports covers it.
    const geometry = await measureRenderGeometry(audioContext)
    contract.setGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // 5. The pipeline and the handler.
    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = Handler.create(context, pipeline).prepare(contract)
    pipeline.destroy()
    console.log(`latency: ${handler.latency()} samples`)

    // 6. The audio node: two inputs and two outputs, one per Streamed slot, the slots'
    //    channels. An offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = await handler.createAudioNode(audioContext, { waitMs })

    // 7. After an output-device change: measure with the probe, re-prepare the running node.
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { probe: true })
      contract.setGeometry(g.quantum, g.burst, audioContext.sampleRate)
      audioNode.prepare(contract)
      console.log(`latency: ${handler.latency()} samples`)
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
    return { audioNode, latency: () => handler.latency(), remeasure, teardown }
  }
  return { anira, context, start }
}
