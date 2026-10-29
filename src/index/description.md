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

- **Play / Pause** — start or stop the audio source.
- **Dry / Wet** — toggle between the unprocessed (dry) audio and the
  model-processed (wet) signal.
- **+ Worker / − Worker** — start or stop inference threads. Each one is a
  Wasm Worker that anira runs on the module's memory, taking inferences from
  the shared queue; start more if a single one can't keep up. With none, every
  block misses its inference: you hear the miss policy's fill (the bypassed
  input) and the console logs warnings.

The source code for setting up each demo is presented below the controls on
the demo page.
