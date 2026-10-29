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
  renderBurstFrames,
} from '@anira-project/anira'
import type { AniraAudioNode } from '@anira-project/anira'
// The stage's module on this thread too: its prepare and unprepare run here.
import { GAIN_CLAMP_STAGE, GAIN_SLOT } from './gain-clamp-stage'
// The same module for the audio worklet, bundled by Vite into one self-contained ES module.
import stageModule from './gain-clamp-stage.ts?worker&url'

/** The render quantum: one handler call per quantum. */
const QUANTUM = 128

export type GainClamp = {
  anira: Anira
  context: Context
  audioNode: AniraAudioNode
  /** The gain's AudioParam, before the stage's clamp. */
  gain: AudioParam
  /** The handler's latency in samples: the output is the input this much later. */
  latency: number
  teardown: () => void
}

/**
 * The demo's anira chain on `audioContext`, up to the handler's audio node: Simple Gain Stereo's
 * model and contract on the built-in ONNX Runtime engine, with a JavaScript stage
 * (gain-clamp-stage.ts) whose pre_process clamps the Static gain to at most 1.0, in the audio
 * worklet. `waitMs` lets each quantum wait for its inference (an offline render).
 */
export async function createGainClamp(
  audioContext: BaseAudioContext,
  { waitMs = 0 } = {}
): Promise<GainClamp> {
  // 1. The module on this thread and its log, to the console.
  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()

  // 2. A context without a pool: the page starts and stops the inference threads itself.
  const context = Context.create(anira, { threads: 0 })

  // 3. The configs of Simple Gain Stereo, unchanged.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('simple-gain-stereo.model.json', site)
  )
  const contract = (
    await Contract.fromUrl(anira, new URL('simple-gain-stereo.contract.json', site))
  ).setGeometry(QUANTUM, renderBurstFrames(audioContext), audioContext.sampleRate)

  // 4. The pipeline with the JavaScript stage, under the name its module defines it by: its
  //    pre_process crosses into the worklet, prepare and unprepare into this thread. The stage
  //    states ANIRA_STAGE_FLAG_REALTIME_PRE_POST (the default), which a Hard contract requires.
  const pipeline = Pipeline.create(anira)
    .addInference(model)
    .addStage(GAIN_CLAMP_STAGE, {
      hooks: ANIRA_EM_HOOK_PRE | ANIRA_EM_HOOK_PREPARE | ANIRA_EM_HOOK_UNPREPARE,
    })
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy()
  contract.destroy()
  const latency = handler.latency()
  console.log(`latency: ${latency} samples`)

  // 5. The audio node: the stage's module loaded into the worklet first, the gain an AudioParam.
  const audioNode = await handler.createAudioNode(audioContext, {
    params: [GAIN_SLOT],
    waitMs,
    workletModules: [stageModule],
  })
  const gain = audioNode.params.get(GAIN_SLOT)!
  gain.value = 1

  // 6. The teardown, in reverse: the node stops calling the handler first.
  const teardown = () => {
    audioNode.node.disconnect()
    audioNode.destroy()
    handler.destroy()
    model.destroy()
    context.destroy()
    stopLogPump()
  }
  return { anira, context, audioNode, gain, latency, teardown }
}
