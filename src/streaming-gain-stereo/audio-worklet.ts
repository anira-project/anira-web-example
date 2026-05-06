import {
  AniraAudioWorkletBase,
  type AniraWorkletState,
} from 'anira-web/workers/worklet-base'

const AUDIO_CHANNELS = 2
const GAIN_CHANNELS = 1
const NUM_TENSORS = 2

class StreamingGainStereo extends AniraAudioWorkletBase {
  private inputTensors = { tensorPtrs: 0, numSamplesPtr: 0 }
  private outputTensors = { tensorPtrs: 0, numSamplesPtr: 0 }

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 1.0, minValue: 0.0, maxValue: 2.0 }]
  }

  protected async onConfigured(_state: AniraWorkletState) {
    // Two tensors: audio (2 ch) + gain (1 ch). The base class already laid
    // out the channel pointers contiguously in inputBufferPtr/outputBufferPtr,
    // so buildMultiTensorPointers just needs to know the per-tensor split.
    this.inputTensors = this.buildMultiTensorPointers('input', [
      AUDIO_CHANNELS,
      GAIN_CHANNELS,
    ])
    this.outputTensors = this.buildMultiTensorPointers('output', [
      AUDIO_CHANNELS,
      GAIN_CHANNELS,
    ])
  }

  protected processAudioBlock(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    state: AniraWorkletState,
    bufferSize: number,
    parameters: Record<string, Float32Array>
  ): void {
    const { inferenceHandler, ioConfig, inputChannelViews } = state
    const heapU32 = state.aniraWeb.getHeapU32()

    const inputNode = inputs[ioConfig.inputNodeIndex]
    const outputNode = outputs[ioConfig.outputNodeIndex]

    if (outputNode?.length) {
      for (let ch = 0; ch < outputNode.length; ch++) outputNode[ch].fill(0)
    }

    // Copy stereo audio into channels 0–1 (audio tensor).
    this.copyAudioInputsToChannels(inputNode, state, bufferSize, 0, AUDIO_CHANNELS)

    // Fill channel 2 (gain tensor) from the AudioParam.
    const gainParam = parameters.gain
    const gainView = inputChannelViews[AUDIO_CHANNELS]
    if (gainParam.length === 1) {
      gainView.fill(gainParam[0], 0, bufferSize)
    } else {
      gainView.set(gainParam.subarray(0, bufferSize), 0)
    }

    // Both tensors run with the same per-quantum sample count.
    for (let i = 0; i < NUM_TENSORS; i++) {
      heapU32[this.inputTensors.numSamplesPtr / 4 + i] = bufferSize
      heapU32[this.outputTensors.numSamplesPtr / 4 + i] = bufferSize
    }

    const resultPtr = inferenceHandler.processMulti(
      this.inputTensors.tensorPtrs,
      this.inputTensors.numSamplesPtr,
      this.outputTensors.tensorPtrs,
      this.outputTensors.numSamplesPtr
    )
    const samplesProcessed = heapU32[resultPtr / 4]

    // Only the first tensor (audio) is routed back to the Web Audio output.
    this.copyAudioOutputsFromChannels(
      outputNode,
      state,
      samplesProcessed,
      0,
      AUDIO_CHANNELS
    )
  }
}

registerProcessor('streaming-gain-stereo', StreamingGainStereo)
