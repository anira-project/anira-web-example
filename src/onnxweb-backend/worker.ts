// The context's worker module: every inference Worker imports it before its loop, in its own
// realm (no closure or object of the page reaches it). It defines the ONNX Runtime Web engine
// under the id the model config names; the engine's init, awaited before the Worker's loop,
// loads onnxruntime-web's wasm module in this Worker and creates the session over the model.
import { defineEngine } from '@anira-project/anira/scope'
import {
  ONNXRUNTIME_WEB_ENGINE_ID,
  onnxRuntimeWeb,
} from '@anira-project/anira/engines/onnxruntime-web'

// The site's public/ directory, from this Worker (whose location is its own script's URL).
const site = new URL(import.meta.env.BASE_URL, self.location.origin)

defineEngine(
  ONNXRUNTIME_WEB_ENGINE_ID,
  onnxRuntimeWeb({ model: new URL('simple-gain-stereo.onnx', site) })
)
