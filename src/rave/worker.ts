// The context's worker module: the inference Worker imports it before its loop, in its own realm.
// It defines the ONNX Runtime Web engine with two intra-op threads per inference: the engine's
// init, awaited before the Worker's loop, loads onnxruntime-web's wasm module in this Worker and
// starts one Worker of onnxruntime-web's own, so each inference of the RAVE model runs on two
// threads. anira's built-in ONNX Runtime engine runs one thread in the browser (the module starts
// no pthread), and the model's state lets only one inference run at a time, so this is how one
// inference gets more than one core.
//
// The engine gets the model itself (`model`): it fetches rave.onnx and creates its session in its
// init, then warms it up with three inferences over zeros (`warmup`), all before the Worker's
// loop, so the stream starts warm. Over the config's model entry the session would come at the
// first call, inside the stream, and that block would miss. anira warms up its built-in engines
// only (a contract's "warmup"); a JavaScript engine warms itself.
import { defineEngine } from '@anira-project/anira/scope'
import {
  ONNXRUNTIME_WEB_ENGINE_ID,
  onnxRuntimeWeb,
} from '@anira-project/anira/engines/onnxruntime-web'

const site = new URL(import.meta.env.BASE_URL, self.location.origin)

defineEngine(
  ONNXRUNTIME_WEB_ENGINE_ID,
  onnxRuntimeWeb({ model: new URL('rave.onnx', site), numThreads: 2, warmup: 3 })
)
