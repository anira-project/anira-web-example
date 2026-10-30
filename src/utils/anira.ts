// The platform part every demo shares and none of them is about: the module on this thread with
// its log, the teardown order, the plan log, and the re-measure after an output-device change.
// Each demo's setup.ts keeps its anira chain itself, in the order of the C++ examples.
import { Anira, anira_engine, measureRenderGeometry } from '@anira-project/anira'
import type { AniraAudioNode, ContractHandle, PlanReport } from '@anira-project/anira'

/**
 * The module on this thread (its shared memory grows as the models need), its log to the
 * console through the log pump (the web has no drain thread), and `own`: every object it is
 * handed is destroyed by `teardown`, in reverse order (the nodes before their handlers, the
 * configs, the context last), then the pump stops.
 */
export async function openAnira() {
  const anira = await Anira.create()
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()
  const owned: { destroy(): void }[] = []
  const own = <T extends { destroy(): void }>(object: T): T => {
    owned.push(object)
    return object
  }
  const teardown = () => {
    for (const object of owned.reverse()) {
      if ('node' in object) (object as AniraAudioNode).node.disconnect()
      object.destroy()
    }
    stopLogPump()
  }
  return { anira, own, teardown }
}

/** The plans a prepare compiled, to the console: the engine (by id or name) and the budget. */
export const logPlans = (report: PlanReport) => {
  for (const plan of report.plans()) {
    const engine =
      plan.engineId ??
      Object.entries(anira_engine).find(([, value]) => value === plan.engine)?.[0]
    console.log(`plan: ${engine}, ${plan.budgetMs} ms budget`)
  }
}

/**
 * After an output-device change: measure the context again with its running nodes held (silent,
 * so their rendering does not hide the device's callbacks from the probe), give the contract the
 * new geometry and re-prepare every node (it holds off while its handler re-prepares).
 */
export const remeasure = async (
  audioContext: BaseAudioContext,
  contract: ContractHandle,
  nodes: AniraAudioNode[]
) => {
  const g = await measureRenderGeometry(audioContext, { hold: nodes })
  contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)
  for (const node of nodes) logPlans(node.prepare(contract))
}
