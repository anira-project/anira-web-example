import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import license from 'rollup-plugin-license'
import { licenseConfig } from './licenses'

const CORS_HEADERS = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
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
  build: {
    target: 'esnext',
    assetsInlineLimit: 0, // Never inline WASM files
    rollupOptions: {
      input: {
        main: './index.html',
        'simple-gain-stereo': './simple-gain-stereo.html',
        'streaming-gain-stereo': './streaming-gain-stereo.html',
        'js-callback': './js-callback.html',
        'onnx-runtime-web-backend': './onnx-runtime-web-backend.html',
        'js-copying': './js-copying.html',
        'pre-post-processors': './pre-post-processors.html',
        'steerable-nafx': './steerable-nafx.html',
        'guitar-lstm': './guitar-lstm.html',
        scyclone: './scyclone.html',
        licenses: './licenses.html',
      },
      output: { format: 'es' },
      plugins: [license(licenseConfig)],
    },
  },
  worker: { format: 'es' },
  server: { headers: CORS_HEADERS, fs: { strict: false } },
  preview: { headers: CORS_HEADERS },
})
