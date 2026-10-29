// The smoke check's worklet module: its stage quarters the model's audio input in pre_process,
// in the audio worklet.
import { anira_status, defineStage, layout } from '@anira-project/anira/scope'

export const QUARTER_STAGE = 'org.anira-web-example.smoke-quarter'

defineStage(QUARTER_STAGE, ({ abi, module }) => {
  // The tensor record the accessor fills, allocated once when the instance is built.
  const tensor = module._malloc(layout.anira_tensor.size)
  return {
    preProcess(ctx: number): number {
      const popped = module._anira_stage_default_pre_process(ctx)
      if (popped < 0) return popped
      if (module._anira_stage_input_tensor(ctx, 0, tensor) !== anira_status.ANIRA_OK) {
        return anira_status.ANIRA_ERROR_INVALID_ARGUMENT
      }
      const audio = abi.anira_tensor_data_f32(tensor) >>> 2
      const count = abi.anira_tensor_num_elements(tensor)
      for (let i = 0; i < count; i++) module.HEAPF32[audio + i] *= 0.25
      return anira_status.ANIRA_OK
    },
  }
})
