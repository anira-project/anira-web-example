import { JSBackendBase, BufferF, VectorBufferF } from 'anira-web'

// This backend demonstrates how to implement a custom JS-based inference backend.
// The process method is called from C++. In this case, it simply copies input to output in JS.
// Useful for testing the overhead of calling into JS from WASM with the copy operation done in JS.
export class JSCopyBackend extends JSBackendBase {
  override process(inputVecPtr: number, outputVecPtr: number): void {
    const heapF32 = this.wasmInstance.HEAPF32
    const inputVec = this.wrapPointer(VectorBufferF, inputVecPtr)
    const outputVec = this.wrapPointer(VectorBufferF, outputVecPtr)

    const inputSize = inputVec.size()
    const outputSize = outputVec.size()

    for (let tensorIdx = 0; tensorIdx < Math.min(inputSize, outputSize); tensorIdx++) {
      const inputBuffer = this.wrapPointer(BufferF, inputVec.get(tensorIdx))
      const outputBuffer = this.wrapPointer(BufferF, outputVec.get(tensorIdx))

      const inputChannels = inputBuffer.getNumChannels()
      const inputSamples = inputBuffer.getNumSamples()
      const outputChannels = outputBuffer.getNumChannels()
      const outputSamples = outputBuffer.getNumSamples()

      const equalChannels = inputChannels === outputChannels
      const sampleDiff = inputSamples - outputSamples

      if (equalChannels && sampleDiff >= 0) {
        for (let channel = 0; channel < inputChannels; channel++) {
          const readPtr = inputBuffer.getReadPointer(channel)
          const writePtr = outputBuffer.getWritePointer(channel)

          const inputOffset = readPtr >> 2
          const outputOffset = writePtr >> 2

          for (let i = 0; i < outputSamples; i++) {
            heapF32[outputOffset + i] = heapF32[inputOffset + i + sampleDiff]
          }
        }
      } else {
        console.log(
          `Skipping processing for tensor ${tensorIdx} due to dimension mismatch (input: ${inputChannels}x${inputSamples}, output: ${outputChannels}x${outputSamples})`
        )
        outputBuffer.clear()
      }
    }
  }
}
