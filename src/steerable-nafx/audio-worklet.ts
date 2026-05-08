import {
  JSPrePostProcessor,
  resolvePtr,
  VectorRingBuffer,
  type PossiblePointer,
  type VectorBufferF,
} from '@anira-project/anira'
import {
  AniraAudioWorkletBase,
  type AniraWorkletState,
} from '@anira-project/anira/workers/worklet-base'

const BUFFER_SIZE = 1024
const CNN_RECEPTIVE_FIELD = 132
const TENSOR_INPUT_SIZE = BUFFER_SIZE + CNN_RECEPTIVE_FIELD
const TENSOR_OUTPUT_SIZE = BUFFER_SIZE

/**
 * Reimplements CNNPrePostProcessor::pre_process in JavaScript.
 *
 * Creates a sliding window where each inference input contains
 * `receptiveField` old samples + `bufferSize` new samples.
 */
class CNNPrePostProcessor extends JSPrePostProcessor {
  override preProcess(
    ringBuffers: PossiblePointer<VectorRingBuffer>,
    buffers: PossiblePointer<VectorBufferF>,
    _backend: number
  ): void {
    const ringBuffer0 = this.wasmInstance._vector_ring_buffer_get(
      resolvePtr(ringBuffers),
      0
    )
    const buffer0 = this.wasmInstance._vector_buffer_f_get(resolvePtr(buffers), 0)

    this.wasmInstance._prepostprocessor_pop_samples_from_buffer_window(
      this.getPointer(),
      ringBuffer0,
      buffer0,
      TENSOR_OUTPUT_SIZE,
      TENSOR_INPUT_SIZE - TENSOR_OUTPUT_SIZE
    )
  }
}

class SteerableNafxWorklet extends AniraAudioWorkletBase {
  protected async onConfigured(state: AniraWorkletState) {
    const { aniraWeb, prePostProcessorPtr } = state

    const ppProcessor = CNNPrePostProcessor.createFromPointer(
      aniraWeb.getWasmInstance(),
      prePostProcessorPtr
    )

    aniraWeb.registerPrePostProcessor(ppProcessor)
  }
}

registerProcessor('steerable-nafx', SteerableNafxWorklet)
