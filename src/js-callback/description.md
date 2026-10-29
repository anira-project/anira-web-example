# JS Callback

Inference doesn't have to run inside anira's WASM module — it can
just as well run in JavaScript on the inference thread. This demo
shows the simplest version of that: a **JavaScript engine** whose
`process` anira calls from the Worker's C loop for every inference.
It passes its inputs through, one native copy of the shared memory
per tensor (`copyWithin`). No model is loaded: the model config's
entry names the engine and no `path`, and the pipeline registers the
engine with `ANIRA_ENGINE_FLAG_NEEDS_NO_MODEL`, which makes an entry
without a model file legal.

So what you hear is the unmodified input, the handler's latency
later. The point of the demo is the wire-up: an engine is defined
with `defineEngine` in the context's **worker module** (`worker.ts`),
which every inference Worker imports in its own realm before its
loop; `process` is synchronous there. The
[JS Copying demo](js-copying.html) writes the same engine as a class
that copies sample by sample, the template for wrapping another
runtime; the [ONNX Runtime Web Backend demo](onnx-runtime-web-backend.html)
uses the pattern to run a model with `onnxruntime-web`.

This is also the one demo that **starts its own inference threads**.
Its context is created with `threads: 0`, no pool, and the page runs
`anira_inference_thread_*` threads itself (`inferenceThreads.ts`, the
typed C entries on `anira.abi`), each a Wasm Worker that imports the
worker module: **+ Worker** starts one, **− Worker** stops the newest.
A pool's size is fixed when it is created; these threads come and go
while the audio plays. With none, every block misses its inference and
you hear the miss policy's fill, the bypassed input. Every other demo
uses the context's default pool.

Full pattern in
[Custom Inference Backends](https://anira-project.github.io/anira/web-api/custom_inference_backends.html).
