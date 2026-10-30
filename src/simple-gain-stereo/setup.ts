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

/** The model's Static input `gain`: input slot 1 of the model config. */
export const GAIN_SLOT = 1

/** The chain on a running context: what `start` returns. */
export type SimpleGainStereoChain = {
  audioNode: AniraAudioNode
  /** The gain's AudioParam: set, ramp or automate it. */
  gain: AudioParam
  /** The handler's latency in samples: the output is the input this much later. */
  latency: () => number
  /** Measure the context's render geometry again and re-prepare the running node. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the chain on a context. */
export type SimpleGainStereo = {
  anira: Anira
  context: Context
  start: (
    audioContext: BaseAudioContext,
    options?: { waitMs?: number }
  ) => Promise<SimpleGainStereoChain>
}

/**
 * The demo's anira chain: the model and contract files a native host loads unchanged, run by
 * the module's built-in ONNX Runtime engine. Loading needs no audio; `start` needs a running
 * context (a live one is measured: `await audioContext.resume()` first) and builds the chain up
 * to the handler's audio node, which the page connects. `waitMs` lets each quantum wait for its
 * inference (an offline render).
 */
export async function loadSimpleGainStereo(): Promise<SimpleGainStereo> {
  // 1. The module on this thread (a shared 512 MiB memory) and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump() // the web has no drain thread

  // 2. A context with the default pool of inference threads (Wasm Workers). The built-in
  //    engine needs no worker module.
  const context = Context.create(anira)

  // 3. The configs: public/simple-gain-stereo.model.json names the .onnx beside it, which
  //    fromUrl fetches and attaches; the contract leaves the geometry to the host.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('simple-gain-stereo.model.json', site)
  )
  const contract = await Contract.fromUrl(
    anira,
    new URL('simple-gain-stereo.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // 4. The geometry, measured on the running context: one render quantum per call, blocks up
    //    to the burst it renders back to back, so the latency the handler reports covers it.
    const geometry = await measureRenderGeometry(audioContext)
    contract.setGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // 5. The pipeline and the handler.
    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = Handler.create(context, pipeline).prepare(contract)
    pipeline.destroy() // the handler copied it
    console.log(`latency: ${handler.latency()} samples`)

    // 6. The audio node: one input and output per Streamed slot (stereo), the gain a k-rate
    //    AudioParam of the node. An offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = await handler.createAudioNode(audioContext, {
      params: [GAIN_SLOT],
      waitMs,
    })
    const gain = audioNode.params.get(GAIN_SLOT)!
    gain.value = 1

    // 7. After an output-device change: measure again, holding the running node meanwhile
    //    (silent, so its rendering does not hide the device's callbacks from the probe), and
    //    re-prepare it for the new geometry (it holds off while the handler re-prepares).
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
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
    return { audioNode, gain, latency: () => handler.latency(), remeasure, teardown }
  }
  return { anira, context, start }
}
