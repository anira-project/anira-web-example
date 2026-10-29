// The package smoke: what every demo relies on, from the linked package as this site's bundler
// and server deliver it. The module on the page, a context of one Wasm Worker importing a worker
// module (engine.ts), a JavaScript stage in a worklet module (stage.ts), a Hard handler of block
// 128 and an OfflineAudioContext rendered through its audio node: output = 2 * 0.25 * input.
import {
  ANIRA_EM_HOOK_PRE,
  ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL,
  Anira,
  Context,
  Contract,
  Handler,
  ModelConfig,
  Pipeline,
} from '@anira-project/anira'
import workerModule from './engine.ts?worker&url'
import stageModule from './stage.ts?worker&url'
import { DOUBLE_ENGINE } from './engine'
import { QUARTER_STAGE } from './stage'
import { energy, renderOffline, sine, worstError, type Checks } from '../common'

const RATE = 48000
const QUANTUM = 128
const QUANTA = 64

export const run = async (): Promise<Checks> => {
  const checks: Checks = []
  const check = (ok: boolean, what: string) => checks.push({ ok, what })

  const anira = await Anira.create()
  anira.setLogHook()
  const stopLogPump = anira.startLogPump()
  check(anira.version.length > 0, `the module is anira ${anira.version}`)

  const context = Context.create(anira, { threads: 1, workerModule })
  const streamed = (name: string) => ({
    name,
    dtype: 'float32',
    role: 'streamed',
    axes: [
      ['batch', 1],
      ['channel', 1],
      ['time', QUANTUM],
    ],
    window: { min: QUANTUM, max: QUANTUM },
  })
  const model = await ModelConfig.fromJson(
    anira,
    JSON.stringify({
      models: [{ engine: DOUBLE_ENGINE, path: 'no-model-file' }],
      inputs: [streamed('audio_in')],
      outputs: [streamed('audio_out')],
    }),
    { fetchModel: () => false }
  )
  const pipeline = Pipeline.create(anira)
    .addInference(model)
    .registerEngine(DOUBLE_ENGINE, { flags: ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL })
    .addStage(QUARTER_STAGE, { hooks: ANIRA_EM_HOOK_PRE })
  const contract = Contract.hard(anira, { blockMin: QUANTUM, rate: RATE, budgetMs: 2 })
  const handler = Handler.create(context, pipeline).prepare(contract)
  pipeline.destroy()
  contract.destroy()
  const latency = handler.latency()
  await context.ready()
  check(true, `the worker module's Wasm Worker is in its loop (latency ${latency})`)

  const audio = new OfflineAudioContext(1, QUANTUM * QUANTA, RATE)
  const audioNode = await handler.createAudioNode(audio, {
    waitMs: 500,
    workletModules: [stageModule],
  })
  const samples = sine(QUANTUM * QUANTA, RATE)
  const [rendered] = await renderOffline(audio, audioNode.node, [samples])
  const worst = worstError(rendered, latency, (j) => 0.5 * samples[j])
  check(
    energy(rendered) > 1,
    `the node rendered audio (energy ${energy(rendered).toFixed(2)})`
  )
  check(
    worst < 1e-6,
    `the output is the input quartered by the worklet's stage and doubled by the Worker's ` +
      `engine, ${latency} samples later (worst error ${worst})`
  )

  audioNode.destroy()
  handler.destroy()
  model.destroy()
  context.destroy()
  stopLogPump()
  return checks
}
