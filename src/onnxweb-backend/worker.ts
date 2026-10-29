// The context's worker module: every inference Worker imports it before its loop, in its own
// realm (no closure or object of the page reaches it). It defines the ONNX Runtime Web engine
// under the id the model config names; the engine's init, awaited before the Worker's loop,
// loads onnxruntime-web's wasm module in this Worker, and its session is created from the model
// entry it runs: the .onnx bytes ModelConfig.fromUrl fetched once on the main thread and
// attached to the config, read from the shared memory.
import { defineEngine } from '@anira-project/anira/scope'
import {
  ONNXRUNTIME_WEB_ENGINE_ID,
  onnxRuntimeWeb,
} from '@anira-project/anira/engines/onnxruntime-web'

defineEngine(ONNXRUNTIME_WEB_ENGINE_ID, onnxRuntimeWeb())
