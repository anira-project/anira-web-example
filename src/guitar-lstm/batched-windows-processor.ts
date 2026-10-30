// The demo's JavaScript processor: it unfolds the input ring into the batch of overlapping context
// windows the network takes, [512, 1, 150], in pre_process: window b holds the 149 samples
// before new sample b and sample b itself. One native call (anira_ring_pop_windows) pops the
// 512 new samples and writes all 512 windows; the model config's overlap of 149 keeps that
// much history in the ring. It is the pre-processing of anira's native HybridNN example
// (extras/models/hybrid-nn) in JavaScript.
//
// One module, two realms: the main thread imports it for prepare and unprepare, the audio
// worklet loads it (setup.ts: workletModules) for preProcess, which runs inside the C render
// callback.
import {
  ANIRA_DTYPE_F32,
  anira_status,
  defineProcessor,
  layout,
} from '@anira-project/anira/scope'

/** The processor's name: the pipeline adds it under this name (Pipeline.addProcessor). */
export const BATCHED_WINDOWS_PROCESSOR = 'org.anira-web-example.batched-windows'

/** Windows per inference: the batch axis of the model's input. */
const BATCH = 512
/** Samples per window: the time axis of the model's input. */
const CONTEXT = 150

// What prepare allocates per handler: the tensor record of the input and the ring slot the
// accessors fill, so the audio thread allocates nothing.
const TENSOR = 0
const RING = layout.anira_tensor.size
const PREPARED_BYTES = RING + 4

defineProcessor(BATCHED_WINDOWS_PROCESSOR, ({ abi, module }) => ({
  // Main thread, at the handler's prepare; freed in unprepare.
  prepare(_prepareInfo: number, outPrepared: number): number {
    const prepared = module._malloc(PREPARED_BYTES)
    if (prepared === 0) return anira_status.ANIRA_ERROR_OUT_OF_MEMORY
    module.HEAPU32[outPrepared >>> 2] = prepared
    return anira_status.ANIRA_OK
  },

  unprepare(prepared: number): void {
    module._free(prepared)
  },

  // The audio thread, inside the render callback: no allocation, no object literal, no closure.
  // It replaces the default body for the one Streamed input (there is no Static input to
  // materialise).
  preProcess(ctx: number, prepared: number): number {
    const tensor = prepared + TENSOR
    const ring = prepared + RING
    if (
      module._anira_processor_input_tensor(ctx, 0, tensor) !== anira_status.ANIRA_OK ||
      module._anira_processor_input_ring(ctx, 0, ring) !== anira_status.ANIRA_OK
    ) {
      return anira_status.ANIRA_ERROR_INVALID_ARGUMENT
    }
    const written = module._anira_ring_pop_windows(
      module.HEAPU32[ring >>> 2],
      0,
      abi.anira_tensor_data_f32(tensor),
      ANIRA_DTYPE_F32,
      1,
      CONTEXT - 1,
      0,
      BATCH
    )
    return written === BATCH * CONTEXT
      ? anira_status.ANIRA_OK
      : anira_status.ANIRA_ERROR_INVALID_STATE
  },
}))
