# JS Copying

A user-written custom inference backend. Where
[js-callback](/js-callback.html) just plugs in the built-in
`JSBackendBase` directly, this demo subclasses it to ship the full
recipe documented in
[Custom Inference Backends]($DOCS_URL/web-api/custom_inference_backends.html):

- A `JSCopyBackend` class extending
  [`JSBackendBase`]($DOCS_URL/web-api/reference/class/JSBackendBase.html),
  with a `process` override that walks the input/output tensor
  vectors and copies samples through the WASM heap.
- A one-line custom inference worker file (`customInferenceWorker.ts`)
  that registers the class with `setupInferenceWorker`.
- Main-thread wiring that spawns that custom worker via
  `aniraWeb.spinUpInferenceWorker(customInferenceWorkerUrl)`.

As with [js-callback](/js-callback.html), no model is actually
loaded — the override copies input to output sample by sample, so
what you hear is the unmodified audio. The point is the plumbing.
Use this as the template when writing your own JS-side inference
engine — e.g. wrapping a different runtime, driving GPU code, or
patching in a stub for testing.
