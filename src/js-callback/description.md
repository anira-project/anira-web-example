# JS Callback

Inference doesn't have to run inside anira's WASM module — it can
just as well run in JavaScript on the inference worker thread. This
demo shows the simplest version of that: it plugs in
[`JSBackendBase`]($DOCS_URL/web-api/reference/class/JSBackendBase.html)
as the inference backend, which fires a JS hook for every block and
performs a passthrough copy on the WASM side. No model is actually
loaded — the `.onnx` file is registered in `ModelData` for the
plumbing's sake, but `JSBackendBase` ignores it.

So what you hear is the unmodified input. The point of the demo is
the wire-up: how to swap anira's default inference path for a
JavaScript one. The
[js-copying demo](/js-copying.html) takes the next step and
subclasses `JSBackendBase` to ship a real custom backend with its
own custom inference worker; the
[onnx-runtime-web-backend demo](/onnx-runtime-web-backend.html)
shows the same pattern using `onnxruntime-web` to actually run a
model.

Full pattern in
[Custom Inference Backends]($DOCS_URL/web-api/custom_inference_backends.html).
