import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import license from 'rollup-plugin-license'
import { licenseConfig } from './licenses'
import { fetchModels } from './fetch-models'

// The module's memory is a shared WebAssembly.Memory, which needs cross-origin isolation: every
// response of `vite` and `vite preview` carries COOP and COEP (GitHub Pages cannot send headers,
// coi-serviceworker stands in there).
const CORS_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    // The model files too large for git (the RAVE demo's), into public/ before anything starts.
    fetchModels(),
    viteStaticCopy({
      targets: [
        {
          // Really just for setting CORS cross origin isolation headers on github pages
          src: 'node_modules/coi-serviceworker/coi-serviceworker.min.js',
          dest: '.',
        },
      ],
    }),
  ],
  // The packages as they are: the dev server must not pre-bundle them (anira's module glue loads
  // itself into the inference Workers and the audio worklet; onnxruntime-web, which the
  // Steerable-NAFX check runs as its oracle, loads its own wasm by URL).
  optimizeDeps: { exclude: ['@anira-project/anira', 'onnxruntime-web'] },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0, // Never inline WASM files
    rollupOptions: {
      input: {
        main: './index.html',
        'simple-gain-stereo': './simple-gain-stereo.html',
        'onnx-runtime-web-backend': './onnx-runtime-web-backend.html',
        'pre-post-processors': './pre-post-processors.html',
        'steerable-nafx': './steerable-nafx.html',
        'streaming-gain-stereo': './streaming-gain-stereo.html',
        'js-callback': './js-callback.html',
        'js-copying': './js-copying.html',
        'guitar-lstm': './guitar-lstm.html',
        rave: './rave.html',
        licenses: './licenses.html',
      },
      output: { format: 'es' },
      plugins: [license(licenseConfig)],
    },
  },
  // A worker module (`import url from './engine.ts?worker&url'`) or a worklet module is bundled
  // into one self-contained ES module: a worklet scope cannot import a chunk.
  worker: {
    format: 'es',
    rolldownOptions: { output: { codeSplitting: false } },
  },
  // fs.strict off: the linked package (file:../anira/web) lives outside the project root.
  server: { headers: CORS_HEADERS, fs: { strict: false } },
  preview: { headers: CORS_HEADERS },
})
