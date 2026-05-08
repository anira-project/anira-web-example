# Anira Web Demo

A small collection of in-browser demos for [anira](https://github.com/anira-project/anira) — a real-time neural network inference library for low-latency audio processing. The demos use `@anira-project/anira`, which ships the C++ library compiled to WebAssembly with a TypeScript wrapper that integrates with the Web Audio API.

## Demos

- **Simple Gain Stereo** — gain effect on stereo audio with a WASM ONNX backend
- **Streaming Gain Stereo** — same effect with real-time streaming
- **JS Callback** — JavaScript callback as the inference backend
- **ONNX Runtime Web Backend** — inference via ONNX Runtime Web
- **JS Copying** — pass-through using the JS copy backend
- **PrePostProcessors** — custom JS pre/post-processing in the inference pipeline
- **Steerable-NAFX (CNN)** — guitar amp sim with sliding-window context
- **GuitarLSTM (HybridNN)** — guitar amp sim with batched LSTM context
- **Scyclone (funk_drums)** — RAVE-based timbre transfer into a funk drums corpus

## Local development

```bash
npm install
npm run dev
```

The dev server sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` so `SharedArrayBuffer` and threaded WASM work out of the box.

## Build

```bash
npm run build
npm run preview
```

## Deployment

The site is deployed to GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.

GitHub Pages cannot set custom HTTP headers, so cross-origin isolation (required for `SharedArrayBuffer`) is established client-side via [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker). It's loaded as the first script in every HTML entry; on first visit it registers a service worker and reloads once, after which `crossOriginIsolated === true`.

## Links

- [anira (main repo)](https://github.com/anira-project/anira)
- [Anira Web API docs](https://anira-project.github.io/anira/web-api/index.html)

## Third-party licenses

The deployed site bundles third-party open-source software. Attribution is auto-generated at build time by [`rollup-plugin-license`](https://github.com/mjeanroy/rollup-plugin-license) into `dist/THIRD_PARTY_LICENSES.txt` and rendered on the [`/licenses.html`](licenses.html) subpage. If a dependency pre-bundles further OSS code that the rollup graph can't see, list it in `INLINED_BUNDLED_DEPS` in `vite.config.ts` so it gets attributed too.
