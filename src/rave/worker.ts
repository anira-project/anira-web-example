// The context's worker module: the inference Worker imports it before its loop, in its own realm.
// It defines the ONNX Runtime Web engine with two intra-op threads per inference: the engine's
// init, awaited before the Worker's loop, loads onnxruntime-web's wasm module in this Worker and
// starts one Worker of onnxruntime-web's own, so each inference of the RAVE model runs on two
// threads. anira's built-in ONNX Runtime engine runs one thread in the browser (the module starts
// no pthread), and the model's state lets only one inference run at a time, so this is how one
// inference gets more than one core. The session is created from the model entry it runs: the
// .onnx bytes ModelConfig.fromUrl fetched once on the main thread, read from the shared memory.
import { defineEngine } from '@anira-project/anira/scope'
import {
  ONNXRUNTIME_WEB_ENGINE_ID,
  onnxRuntimeWeb,
} from '@anira-project/anira/engines/onnxruntime-web'

defineEngine(ONNXRUNTIME_WEB_ENGINE_ID, onnxRuntimeWeb({ numThreads: 2 }))
