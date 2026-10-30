# Anira Web Demo — `v3` branch

A small collection of in-browser demos for [anira](https://github.com/anira-project/anira) — a real-time neural network inference library for low-latency audio processing. This branch runs them on **anira 3** (`@anira-project/anira` 3.0.0-alpha.2, not yet on npm): the C++ library compiled to WebAssembly, whose inference threads are Wasm Workers and whose audio path is a Wasm Audio Worklet node with a C render callback, under a typed TypeScript layer over the C ABI. The model and contract files are the same JSON a native anira host loads (`public/*.model.json`, `public/*.contract.json`).

`main` stays on the 2.2.1 release from npm and keeps deploying to GitHub Pages; this branch has no deployment and no CI until 3.0.0-alpha.2 is published.

## Building against a local anira checkout

The dependency is `"@anira-project/anira": "file:../anira/web"`: an anira checkout beside this one, whose package npm links. Until anira PR #221 (`onnxRuntimeWeb({ numThreads })`, which the RAVE demo uses, and the Debug build's Workers) is merged, check out its branch `fix/v3-debug-wasm-memory`; once it is, `v3`.

```bash
# next to this repository
git clone https://github.com/anira-project/anira.git ../anira
cd ../anira
git checkout fix/v3-debug-wasm-memory   # until anira #221 is merged; then v3

# the WASM module (emsdk 4.0.23; emcc --emit-tsd needs tsc on the PATH)
export EMSDK=/path/to/emsdk-4.0.23
cmake --preset wasm-release
cmake --build --preset wasm-release

# the TypeScript package (web/dist)
cd web
npm ci
npm run build          # npm run dev rebuilds on changes

# this site
cd ../../anira-web-example
npm install
npm run dev            # or: npm run build && npm run preview
```

The RAVE demo's model (126 MB, too large for git) is fetched into `public/rave.onnx` (gitignored) when the dev server or a build starts: `fetch-models.ts`, a Vite plugin, downloads `model_forward.onnx` from the [realtime inference workshop](https://github.com/anira-project/realtime-inference-workshop)'s release `workshop-model` and checks its SHA-256, once (`node fetch-models.ts` runs it alone; `RAVE_MODEL=/path/to/model_forward.onnx` copies a local file instead of downloading).

A rebuild of the package (`npm run build` in `anira/web`) reaches the site without a re-install. The dev server and `vite preview` send `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, which the module's shared `WebAssembly.Memory` needs (`crossOriginIsolated`); on GitHub Pages [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) stands in for the headers. The full anira build documentation is [Installation / Building](https://anira-project.github.io/anira/web-api/installation_building.html).

## Tests

```bash
npx playwright install chromium firefox    # once (or point PLAYWRIGHT_BROWSERS_PATH at installed ones)
npm test                                   # = node test/run.mjs all both
node test/run.mjs chromium build steerable-nafx,steerable-nafx.html   # a subset
```

`test/run.mjs` builds the site with the check page `test/check.html`, serves it with COOP/COEP and opens, in headless Chromium and Firefox, built and under the dev server:

- every **check** (`test/check.html?check=<demo>`): the demo's own chain (its `setup.ts`) rendered through an `OfflineAudioContext` and its numbers checked — the gain demos against `input × gain`, the passthrough engines against the input, Steerable-NAFX and GuitarLSTM against the same model run over the whole signal by `onnxruntime-web` on the page, RAVE against the same model run by `onnxruntime-web` block by block with its state fed back (the export is deterministic);
- every **page**: it gets ready and plays after a click on Play (the live output measured on an `AnalyserNode` tap: not silent, silent with the gain at 0); the latency badge and the dry delay agree after the prepare and again after a dispatched `sinkchange` re-prepare; its context's default pool is in its loops (JS Callback: its `+ / − Worker` count up and down); with no console error. Headless Firefox here starts no `AudioContext` (no sound server), so the chain is never built there and it skips the playing, latency and pool steps.

What a person checks by ear: each page in Chrome and Firefox, against the 2.x site.

## Demos

Each demo's anira chain is its `setup.ts`, the page wiring its `index.ts`; the page's source viewer shows both and the JSON files. A setup loads the module, the context and the configs at page load, and its `start` builds the chain on a running context (an `AudioContext` after the first Play's `resume()`, or the check's `OfflineAudioContext`). The first Play shows "Starting…" while it does.

- **RAVE: Magnetic Resonator Piano** — a streaming RAVE model (the realtime inference workshop's export) whose convolution caches are one state tensor: the model config declares the pair (`role: "state"`, `state_source`) and the model's own latency (2224 samples), so anira carries the state between the 2048-sample inferences. The state makes the inferences run one after another, so each one runs on the ONNX Runtime Web engine with two intra-op threads (`onnxRuntimeWeb({ numThreads: 2 })` in the context's worker module, one inference thread): about 37 ms per 46.4 ms block in Chromium, where one thread took about 50. The engine gets the model itself and creates and warms up its session (`warmup: 3`) in its init, before the inference Worker's loop, so the stream starts warm (anira warms up its built-in engines only); a block that misses plays the input (`on_miss: "bypass"`). The input is the workshop's demo, slow synthesized chords (`public/chords.wav`): on drums this model mostly falls silent. With a latency-aligned dry path.
- **GuitarLSTM (HybridNN)** — an LSTM amp model on a batch of 512 overlapping 150-sample windows: the config declares the hop (512) and the history (149), a JavaScript processor unfolds the batch with one `anira_ring_pop_windows` call. The model has no state, so its budget spans three hops (34.8 ms) while the pool runs consecutive inferences side by side: no block missed in 60 s of live play, at 57.9 ms of latency.
- **Steerable-NAFX (CNN)** — a CNN amp model whose receptive field is the model config's declared window and `overlap` (132): no processor, no worklet module.
- **PrePostProcessors** — a JavaScript processor in the audio worklet that clamps the gain to 1.0 in `pre_process`.
- **Streaming Gain Stereo** — the gain as a second Streamed input, a value per sample, driven by a Web Audio LFO into the audio node's second input (the node has one input and one output per Streamed slot).
- **ONNX Runtime Web Backend** — the stereo gain model on the package's ONNX Runtime Web engine, defined in the worker module and initialised in every inference Worker.
- **JS Copying** — a class-based JavaScript engine (`src/misc/JSCopyEngine.ts`) copying sample by sample: the template for wrapping another runtime.
- **JS Callback** — a JavaScript engine (`defineEngine` in the context's worker module) that passes its inputs through, no model; the one demo that starts and stops its own inference threads (`+ / − Worker`).
- **Simple Gain Stereo** — the stereo gain model on the module's built-in ONNX Runtime engine, from `simple-gain-stereo.model.json` and its contract; the gain is a Static input, an AudioParam of the handler's audio node.

Every demo but one creates its context with the default pool of inference threads. JS Callback shows the other way: its context has no pool (`threads: 0`) and its `+ / − Worker` buttons start and stop the page's own `anira_inference_thread_*` threads (`src/utils/inferenceThreads.ts`), because a pool's size is fixed when it is created.

## What changed from the 2.x demos

Every demo is ported but RAVE: Funk & Djembe, whose two stateless models (16384-sample windows, each processed alone) gave way to the stateful RAVE model of the workshop. The 2.x custom audio worklets, `JSPrePostProcessor` subclasses, `JSBackendBase` subclasses and custom inference workers are gone: engines live in the context's worker module, processors in a worklet module, windows in the model config. Removed files: the two unused Scyclone worklets (`grain-delay-worklet.ts`, `transient-splitter-worklet.ts`), which the 2.x demo did not load either. `src/misc/JSCopyBackend.ts` is now `src/misc/JSCopyEngine.ts`.

How the pages use the latency:

- `start` measures the context's render geometry (`measureRenderGeometry`: its render quantum, and the burst of quanta a live context renders back to back) and sets it on the contract before the handler's prepare, so the latency the handler reports covers a burst; prepared for one quantum alone, a handler misses the quanta of each burst past its latency.
- Every page shows the handler's latency, read after the prepare, in a badge ("Latency: N samples (x ms)"), and its dry path goes through a `DelayNode` set to `latency / sampleRate`, so Dry / Wet compares the same moment of the input.
- On `sinkchange` (the page switched the output device) the page measures again, re-prepares the running node (`audioNode.prepare(contract)`, which holds the node off meanwhile; the graph stays connected) and updates the delay and the badge. That is the page's call: an OS default-device change may fire no event.

## Links

- [anira (main repo)](https://github.com/anira-project/anira)
- [Anira Web API docs](https://anira-project.github.io/anira/web-api/index.html)

## Third-party licenses

The site bundles third-party open-source software. Attribution is generated at build time by [`rollup-plugin-license`](https://github.com/mjeanroy/rollup-plugin-license) into `dist/THIRD_PARTY_LICENSES.txt` and rendered on the [`/licenses.html`](licenses.html) subpage. If a dependency pre-bundles further OSS code that the rollup graph can't see, list it in `INLINED_BUNDLED_DEPS` in `licenses.ts` so it gets attributed too.
