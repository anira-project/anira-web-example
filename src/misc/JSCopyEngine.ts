import {
  anira_status,
  engineTensors,
  layout,
  type Engine,
  type EngineFactory,
  type ScopeEnv,
} from '@anira-project/anira/scope'

// This engine demonstrates how to implement a custom JavaScript inference engine: a class with
// the methods anira calls (init before the Worker's loop, process once per inference), built
// once per inference Worker by the factory that defineEngine takes. In this case, it simply
// copies input to output in JavaScript, sample by sample. Useful for testing the overhead of
// calling into JavaScript from the C loop with the copy operation done in JavaScript.
export class JSCopyEngine implements Engine {
  private readonly env: ScopeEnv

  constructor(env: ScopeEnv) {
    this.env = env
  }

  // Before the Worker enters its loop, and may be async: load a model, instantiate a runtime.
  async init(): Promise<void> {}

  // From the Worker's C loop, synchronously: the event loop does not run until the stop.
  process(ctx: number): number {
    const { abi, module } = this.env
    const heapF32 = module.HEAPF32
    const { inputs, outputs } = engineTensors(this.env, ctx)

    for (let slot = 0; slot < Math.min(inputs.length, outputs.length); slot++) {
      const input = inputs[slot]
      const output = outputs[slot]
      if (!input.f32 || !output.f32) return anira_status.ANIRA_ERROR_NOT_SUPPORTED

      // The tensors are packed [..., channels, samples]: the last two axes of the shape.
      const ndim = (ptr: number) =>
        module.HEAPU32[(ptr + layout.anira_tensor.fields.ndim.offset) >>> 2]
      const channels = (ptr: number) =>
        ndim(ptr) >= 2 ? abi.anira_tensor_extent(ptr, ndim(ptr) - 2) : 1
      const samples = (ptr: number) => abi.anira_tensor_extent(ptr, ndim(ptr) - 1)

      const inputChannels = channels(input.ptr)
      const inputSamples = samples(input.ptr)
      const outputChannels = channels(output.ptr)
      const outputSamples = samples(output.ptr)

      const equalChannels = inputChannels === outputChannels
      const sampleDiff = inputSamples - outputSamples

      if (equalChannels && sampleDiff >= 0) {
        for (let channel = 0; channel < inputChannels; channel++) {
          const inputOffset = (input.f32.byteOffset >>> 2) + channel * inputSamples
          const outputOffset = (output.f32.byteOffset >>> 2) + channel * outputSamples

          for (let i = 0; i < outputSamples; i++) {
            heapF32[outputOffset + i] = heapF32[inputOffset + i + sampleDiff]
          }
        }
      } else {
        console.log(
          `Skipping processing for tensor ${slot} due to dimension mismatch (input: ${inputChannels}x${inputSamples}, output: ${outputChannels}x${outputSamples})`
        )
        output.f32.fill(0)
      }
    }
    return anira_status.ANIRA_OK
  }
}

/** The factory of `defineEngine`: one JSCopyEngine per inference Worker. */
export const jsCopyEngine: EngineFactory = (env) => new JSCopyEngine(env)
