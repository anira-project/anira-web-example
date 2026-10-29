// The context's worker module: every inference Worker imports it before its loop. It defines the
// demo's JavaScript engine, a passthrough: process is called from the Worker's C loop once per
// inference and copies each input tensor into the output tensor of the same slot, one native
// copy of the shared memory per tensor (copyWithin), no model involved.
import { anira_status, defineEngine, engineTensors } from '@anira-project/anira/scope'

/** The engine's reverse-URI id: the model entry names it, the pipeline registers it. */
export const PASSTHROUGH_ENGINE = 'org.anira-web-example.passthrough'

defineEngine(PASSTHROUGH_ENGINE, (env) => ({
  process(ctx: number): number {
    const { inputs, outputs } = engineTensors(env, ctx)
    const heap = env.module.HEAPF32
    for (let slot = 0; slot < Math.min(inputs.length, outputs.length); slot++) {
      const input = inputs[slot].f32
      const output = outputs[slot].f32
      if (!input || !output || input.length !== output.length) {
        return anira_status.ANIRA_ERROR_NOT_SUPPORTED
      }
      const from = input.byteOffset >>> 2
      heap.copyWithin(output.byteOffset >>> 2, from, from + input.length)
    }
    return anira_status.ANIRA_OK
  },
}))
