# About

**Anira** is a real-time neural network inference library for low-latency
audio processing.<br>
**Anira Web** ships the same C++ library compiled to
WebAssembly with a TypeScript wrapper that integrates with the Web Audio API.

You can find the documentation for it
[here](https://anira-project.github.io/anira/web-api/index.html).

# Using the demos

Each demo page exposes the same controls:

- **Play / Pause** — start or stop the audio source.
- **Dry / Wet** — toggle between the unprocessed (dry) audio and the
  model-processed (wet) signal.
- **+ Worker / − Worker** — spin up or tear down inference workers. Each
  worker is a Web Worker hosting an inference thread; spawn more if a single
  worker can't keep up. With zero workers, you won't hear anything and the
  console will log warnings.

The source code for setting up each demo is presented below the controls on
the demo page.
