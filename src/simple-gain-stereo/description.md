# Simple Gain Stereo

The smallest end-to-end Anira Web setup, and the foundation every
other demo builds on. A stereo gain model running through the
module's **built-in ONNX Runtime** engine — the default inference
path that ships in anira's WebAssembly module.

The model and its contract are the same JSON files a native host
loads: `simple-gain-stereo.model.json` describes a streamed stereo
audio tensor (a window of 512 samples, fed by the handler block by
block) and a Static scalar `gain`, and names the `.onnx` file beside
it; `simple-gain-stereo.contract.json` is the Hard contract (5 ms per
inference, 10 warm-up runs), its geometry the render quantum at the
context's rate. The gain is an AudioParam of the handler's audio node,
whose render callback hands the model each quantum's value. No stage,
no JavaScript engine, no worker module.

The context runs its default pool of inference threads, each a Wasm
Worker on the module's memory; the page is ready once they are in
their loops (`context.ready()`).

If you want to follow the source step by step, the
[Basic Usage guide](https://anira-project.github.io/anira/web-api/basic_usage.html) walks through
the same six steps.
