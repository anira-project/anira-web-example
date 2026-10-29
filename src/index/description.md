# About

**Anira** is a real-time neural network inference library for low-latency
audio processing.<br>
**Anira Web** ships the same C++ library compiled to
WebAssembly with a typed TypeScript layer over its C ABI that integrates with
the Web Audio API.

You can find the documentation for it
[here](https://anira-project.github.io/anira/web-api/index.html).

# Using the demos

Each demo page exposes the same controls:

- **Play / Pause** — start or stop the audio source. The first Play builds
  the anira chain on the running audio context ("Starting…").
- **Dry / Wet** — toggle between the unprocessed (dry) audio and the
  model-processed (wet) signal; the dry path is delayed by the model's
  latency, so the two line up.
- **Latency** — the handler's latency, measured for this browser and output
  device; it changes when the output device does.

Every demo runs its context's default pool of inference threads, Wasm
Workers that anira starts on the module's memory. The
[JS Callback](js-callback.html) demo instead starts and stops its own with
**+ Worker / − Worker**.

The source code for setting up each demo is presented below the controls on
the demo page.
