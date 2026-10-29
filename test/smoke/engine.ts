// The smoke check's worker module: every inference Worker imports it before its loop. Its engine
// writes the audio input doubled into the output.
import { anira_status, defineEngine, engineTensors } from '@anira-project/anira/scope'

export const DOUBLE_ENGINE = 'org.anira-web-example.smoke-double'

defineEngine(DOUBLE_ENGINE, (env) => ({
  process(ctx: number): number {
    const { inputs, outputs } = engineTensors(env, ctx)
    const audio = inputs[0]?.f32
    const out = outputs[0]?.f32
    if (!audio || !out) return anira_status.ANIRA_ERROR_NOT_SUPPORTED
    for (let i = 0; i < out.length; i++) out[i] = 2 * audio[i]
    return anira_status.ANIRA_OK
  },
}))
