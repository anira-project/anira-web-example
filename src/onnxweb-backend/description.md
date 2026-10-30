# ONNX Runtime Web Backend

The same stereo gain model as
[Simple Gain Stereo](simple-gain-stereo.html), but inference runs
through the **ONNX Runtime Web engine**
(`@anira-project/anira/engines/onnxruntime-web`), a JavaScript engine
that wraps `onnxruntime-web`, instead of the module's built-in ONNX
Runtime.

A JavaScript engine lives in the realm that runs it: every inference
thread is a Wasm Worker with its own globals, which imports the
context's **worker module** (`worker.ts`) before its loop. That module
defines the engine under its id (`defineEngine`), and the engine's
`init` loads onnxruntime-web's wasm module in that Worker; `process`
then runs synchronously from the Worker's loop. The model config names
the engine by the same id and the `.onnx` file beside it, and the
pipeline registers it (`addEngine`). `ModelConfig.fromUrl`
fetches the model once, on the main thread, and attaches its bytes to
the config: every Worker of the context's pool builds an engine
instance of its own, whose session is created from those bytes in the
shared memory, with no fetch of its own.

The wire-up is documented in
[Custom Inference Backends](https://anira-project.github.io/anira/web-api/custom_inference_backends.html).
