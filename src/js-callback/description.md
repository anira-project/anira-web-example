# JS Callback

Inference doesn't have to run inside anira's WASM module — it can
just as well run in JavaScript on the inference thread. This demo
shows the simplest version of that: a **JavaScript engine** whose
`process` anira calls from the Worker's C loop for every inference.
It passes its inputs through, one native copy of the shared memory
per tensor (`copyWithin`). No model is loaded: the model config's
entry names the engine and no file, and the pipeline registers the
engine with `ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL`.

So what you hear is the unmodified input, the handler's latency
later. The point of the demo is the wire-up: an engine is defined
with `defineEngine` in the context's **worker module** (`worker.ts`),
which every inference Worker imports in its own realm before its
loop; `process` is synchronous there. The
[JS Copying demo](js-copying.html) writes the same engine as a class
that copies sample by sample, the template for wrapping another
runtime; the [ONNX Runtime Web Backend demo](onnx-runtime-web-backend.html)
uses the pattern to run a model with `onnxruntime-web`.

Full pattern in
[Custom Inference Backends](https://anira-project.github.io/anira/web-api/custom_inference_backends.html).
