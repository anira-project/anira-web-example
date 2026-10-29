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
inference, 10 warm-up runs). The gain is an AudioParam of the
handler's audio node, whose render callback hands the model each
quantum's value. No stage, no JavaScript engine, no worker module.

The page loads the module, the context and the configs; the first
**Play** builds the chain on the running context. It measures the
context's render geometry (`measureRenderGeometry`: the render quantum
and the burst of quanta a live context renders back to back), sets it
on the contract and prepares the handler, whose latency then covers a
burst. The **latency badge** shows that latency, and the dry path of
**Dry / Wet** is delayed by it, so the two compare the same moment of
the input. When the output device changes (`sinkchange`), the page
measures again and re-prepares the running node, and the badge and the
delay follow. The context runs its default pool of inference threads,
each a Wasm Worker on the module's memory.

If you want to follow the source step by step, the
[Basic Usage guide](https://anira-project.github.io/anira/web-api/basic_usage.html) walks through
the same six steps.
