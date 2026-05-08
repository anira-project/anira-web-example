# Simple Gain Stereo

The smallest end-to-end Anira Web setup, and the foundation every
other demo builds on. A stereo gain plugin running through anira's
**WASM-side ONNX Runtime** — the default inference path that ships
in anira's WebAssembly module.

The model has two tensors: a streamable stereo audio tensor that
flows through the audio worklet block by block, and a non-streamable
scalar gain value updated asynchronously from the slider in the UI.
No custom worklet, no custom backend, no custom pre/post-processing —
just the default everything.

If you want to follow the source step by step, the
[Basic Usage guide](https://anira-project.github.io/anira/web-api/basic_usage.html) walks through
exactly this demo.
