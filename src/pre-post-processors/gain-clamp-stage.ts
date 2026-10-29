// The demo's JavaScript stage: it clamps the model's Static input `gain` to at most 1.0 in
// pre_process, after the default body has popped the audio into the model's input tensor and
// materialised the Static inputs there. Clamping is idempotent, so it runs on every call. You can
// hear it working: above 1.0 the slider has no audible effect.
//
// One module, two realms: the main thread imports it for prepare and unprepare (they run there),
// the audio worklet loads it (setup.ts: workletModules) for preProcess, which runs inside the C
// render callback. Both define the stage under one name; each realm builds its own instance, and
// what they share is the shared memory behind the `prepared` pointer.
import { anira_status, defineStage, layout } from '@anira-project/anira/scope'

/** The stage's name: the pipeline adds it under this name (Pipeline.addStage). */
export const GAIN_CLAMP_STAGE = 'org.anira-web-example.gain-clamp'

/** The model config's input slot of the Static `gain`. */
export const GAIN_SLOT = 1

defineStage(GAIN_CLAMP_STAGE, ({ abi, module }) => ({
  // Main thread, at the handler's prepare: the tensor record preProcess reads the gain through,
  // allocated here so the audio thread allocates nothing; freed in unprepare.
  prepare(_prepareInfo: number, outPrepared: number): number {
    const tensor = module._malloc(layout.anira_tensor.size)
    if (tensor === 0) return anira_status.ANIRA_ERROR_OUT_OF_MEMORY
    module.HEAPU32[outPrepared >>> 2] = tensor
    return anira_status.ANIRA_OK
  },

  unprepare(prepared: number): void {
    module._free(prepared)
  },

  // The audio thread, inside the render callback: no allocation, no object literal, no closure
  // (the stage states ANIRA_STAGE_FLAG_REALTIME_PRE_POST).
  preProcess(ctx: number, prepared: number): number {
    const popped = module._anira_stage_default_pre_process(ctx)
    if (popped < 0) return popped
    if (
      module._anira_stage_input_tensor(ctx, GAIN_SLOT, prepared) !== anira_status.ANIRA_OK
    ) {
      return anira_status.ANIRA_ERROR_INVALID_ARGUMENT
    }
    const gain = abi.anira_tensor_data_f32(prepared) >>> 2
    module.HEAPF32[gain] = Math.min(1.0, module.HEAPF32[gain])
    return anira_status.ANIRA_OK
  },
}))
