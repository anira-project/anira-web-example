# ONNX Runtime Web Backend

The same stereo gain plugin as
[Simple Gain Stereo](/simple-gain-stereo.html), but inference runs
through
[`ONNXRuntimeWebBackend`]($DOCS_URL/web-api/reference/class/ONNXRuntimeWebBackend.html)
— anira-web's second built-in engine — instead of the WASM-side ONNX
Runtime. This backend wraps `onnxruntime-web` on the JavaScript side.

Two changes vs. the simple version: `ModelData` is given a URL string
(`onnxruntime-web` fetches the model itself), and the backend is
selected via `InferenceBackend.CUSTOM` with the backend instance
passed to `InferenceHandler`. The wire-up is documented in the
[basic usage guide]($DOCS_URL/web-api/basic_usage.html#run-inference-in-javascript).
