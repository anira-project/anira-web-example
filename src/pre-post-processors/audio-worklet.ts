import {
  AniraAudioWorkletBase,
  type AniraWorkletState,
} from 'anira-web/workers/worklet-base'
import {
  JSPrePostProcessor,
  type PossiblePointer,
  type VectorBufferF,
  type VectorRingBuffer,
} from 'anira-web'

/**
 * Custom JSPrePostProcessor that clamps the gain to [0, 1].
 *
 * Clamping is idempotent — if the worklet re-reads its own modified value
 * before the main thread writes the next one, clamping again is a no-op.
 * You can hear this working: moving the slider above 1.0 has no effect.
 */
class GainClampPrePostProcessor extends JSPrePostProcessor {
  override preProcess(
    ringBuffers: PossiblePointer<VectorRingBuffer>,
    buffers: PossiblePointer<VectorBufferF>,
    backend: number
  ): void {
    const gain = this.getInput(0, 1)
    this.setInput(Math.min(1.0, gain), 0, 1)
    super.preProcess(ringBuffers, buffers, backend)
  }
}

class PrePostProcessorWorklet extends AniraAudioWorkletBase {
  protected async onConfigured(state: AniraWorkletState) {
    const { aniraWeb, prePostProcessorPtr } = state

    const ppProcessor = GainClampPrePostProcessor.createFromPointer(
      aniraWeb.getWasmInstance(),
      prePostProcessorPtr
    )

    aniraWeb.registerPrePostProcessor(ppProcessor)
  }
}

registerProcessor('pre-post-processors', PrePostProcessorWorklet)
