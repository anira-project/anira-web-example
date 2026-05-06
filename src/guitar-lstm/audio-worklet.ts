import {
  AniraAudioWorkletBase,
  type AniraWorkletState,
} from 'anira-web/workers/worklet-base'
import {
  JSPrePostProcessor,
  resolvePtr,
  type PossiblePointer,
  type VectorBufferF,
  type VectorRingBuffer,
} from 'anira-web'

const BUFFER_SIZE = 2048
const CONTEXT_SAMPLES = 150
const NUM_OUTPUT_SAMPLES = 1

/**
 * Reimplements HybridNNPrePostProcessor::pre_process in JavaScript.
 *
 * Constructs a batched tensor where each batch element is a context
 * window of 150 samples (149 past + 1 new), using per-batch offsets.
 */
class HybridNNPrePostProcessor extends JSPrePostProcessor {
  override preProcess(
    ringBuffers: PossiblePointer<VectorRingBuffer>,
    buffers: PossiblePointer<VectorBufferF>,
    _backend: number
  ): void {
    const ringBuffer0 = this.wasmInstance._vector_ring_buffer_get(
      ringBuffers as number,
      0
    )
    const buffer0 = this.wasmInstance._vector_buffer_f_get(resolvePtr(buffers), 0)

    for (let batch = 0; batch < BUFFER_SIZE; batch++) {
      const offset = batch * CONTEXT_SAMPLES
      this.wasmInstance._prepostprocessor_pop_samples_from_buffer_window_offset(
        this.getPointer(),
        ringBuffer0,
        buffer0,
        NUM_OUTPUT_SAMPLES,
        CONTEXT_SAMPLES - NUM_OUTPUT_SAMPLES,
        offset
      )
    }
  }
}

class GuitarLstmWorklet extends AniraAudioWorkletBase {
  protected async onConfigured(state: AniraWorkletState) {
    const { aniraWeb, prePostProcessorPtr } = state

    const ppProcessor = HybridNNPrePostProcessor.createFromPointer(
      aniraWeb.getWasmInstance(),
      prePostProcessorPtr
    )

    aniraWeb.registerPrePostProcessor(ppProcessor)
  }
}

registerProcessor('guitar-lstm', GuitarLstmWorklet)
