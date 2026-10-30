import {
  ANIRA_EM_HOOK_PRE,
  ANIRA_EM_HOOK_PREPARE,
  ANIRA_EM_HOOK_UNPREPARE,
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
  measureRenderGeometry,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
// The stage's module on this thread too: its prepare and unprepare run here.
import { GAIN_CLAMP_STAGE, GAIN_SLOT } from './gain-clamp-stage'
// The same module for the audio worklet, bundled by Vite into one self-contained ES module.
import stageModule from './gain-clamp-stage.ts?worker&url'

/** The chain on a running context: what `start` returns. */
export type GainClampChain = {
  audioNode: AniraAudioNode
  /** The gain's AudioParam, before the stage's clamp. */
  gain: AudioParam
  /** The handler's latency in samples: the output is the input this much later. */
  latency: () => number
  /** Measure the context's render geometry again and re-prepare the running node. */
  remeasure: () => Promise<void>
  teardown: () => void
}

/** What the page loads before any audio runs; `start` builds the chain on a context. */
export type GainClamp = {
  anira: Anira
  context: Context
  start: (
    audioContext: BaseAudioContext,
    options?: { waitMs?: number }
  ) => Promise<GainClampChain>
}

/**
 * The demo's anira chain: Simple Gain Stereo's model and contract on the built-in ONNX Runtime
 * engine, with a JavaScript stage (gain-clamp-stage.ts) whose pre_process clamps the Static gain
 * to at most 1.0, in the audio worklet. Loading needs no audio; `start` needs a running context
 * (a live one is measured: `await audioContext.resume()` first) and builds the chain up to the
 * handler's audio node. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function loadGainClamp(): Promise<GainClamp> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context with the default pool of inference threads (Wasm Workers). The built-in
  //    engine needs no worker module.
  const context = Context.create(anira)

  // 3. The configs of Simple Gain Stereo, unchanged.
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

    // 5. The pipeline with the JavaScript stage, under the name its module defines it by: its
    //    pre_process crosses into the worklet, prepare and unprepare into this thread. The stage
    //    states ANIRA_STAGE_FLAG_REALTIME_PRE_POST (the default), which a Hard contract requires.
    const pipeline = Pipeline.create(anira)
      .addInference(model)
      .addStage(GAIN_CLAMP_STAGE, {
        hooks: ANIRA_EM_HOOK_PRE | ANIRA_EM_HOOK_PREPARE | ANIRA_EM_HOOK_UNPREPARE,
      })
    const handler = Handler.create(context, pipeline).prepare(contract)
    pipeline.destroy()
    console.log(`latency: ${handler.latency()} samples`)

    // 6. The audio node: the stage's module loaded into the worklet first, the gain an
    //    AudioParam. An offline render waits for its inferences: the pool first.
    if (waitMs > 0) await context.ready()
    const audioNode = await handler.createAudioNode(audioContext, {
      params: [GAIN_SLOT],
      waitMs,
      workletModules: [stageModule],
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
