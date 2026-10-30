import { anira_engine } from '@anira-project/anira'

/**
 * A plan's engine by name, for the log: a JavaScript engine's registered id, else the
 * `anira_engine` enumerator's name (`ANIRA_ENGINE_ONNXRUNTIME`).
 */
export const engineName = (plan: { engine: number; engineId: string | null }): string =>
  plan.engineId ??
  Object.entries(anira_engine).find(([, value]) => value === plan.engine)?.[0] ??
  String(plan.engine)
