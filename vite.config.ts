import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import license from 'rollup-plugin-license'
import * as fs from 'node:fs'
import * as path from 'node:path'

// anira-web pre-bundles onnxruntime-web, so rollup-plugin-license can't see
// it as a transitive dep. List packages here that are inlined into other
// bundled deps and need attribution anyway.
const INLINED_BUNDLED_DEPS = ['onnxruntime-web']

// Packages whose `dist/licenses/` directory should be scanned for nested
// attribution (typically because the package statically links native deps
// into a WASM blob). Each subdirectory under `dist/licenses/` is treated as
// one attributed component, populated by that package's build (e.g. anira's
// cmake/BuildWasm.cmake).
const PACKAGES_WITH_BUNDLED_LICENSES = ['anira-web']

function readInlinedDep(name: string) {
  const dir = path.resolve(__dirname, 'node_modules', name)
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const licenseFile = ['LICENSE', 'LICENSE.txt', 'LICENSE.md']
    .map((f) => path.join(dir, f))
    .find((p) => fs.existsSync(p))
  return {
    name: pkg.name,
    version: pkg.version,
    homepage: pkg.homepage ?? pkg.repository?.url,
    license: pkg.license,
    licenseText: licenseFile ? fs.readFileSync(licenseFile, 'utf8') : null,
  }
}

function parsePackageManifest(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([^:]+):\s*(.*)$/)
    if (m) out[m[1].trim()] = m[2].trim()
  }
  return out
}

function readBundledLicenses(packageName: string) {
  const root = path.resolve(__dirname, 'node_modules', packageName, 'dist', 'licenses')
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dir = path.join(root, e.name)
      const manifestPath = path.join(dir, 'PACKAGE.txt')
      const manifest = fs.existsSync(manifestPath)
        ? parsePackageManifest(fs.readFileSync(manifestPath, 'utf8'))
        : {}
      const licensePath = ['LICENSE', 'LICENSE.txt', 'LICENSE.md']
        .map((f) => path.join(dir, f))
        .find((p) => fs.existsSync(p))
      const noticePath = ['ThirdPartyNotices.txt', 'NOTICE', 'NOTICE.txt']
        .map((f) => path.join(dir, f))
        .find((p) => fs.existsSync(p))
      const parts: string[] = []
      if (licensePath) parts.push(fs.readFileSync(licensePath, 'utf8'))
      if (noticePath) {
        parts.push('\n--- Third-party notices ---\n')
        parts.push(fs.readFileSync(noticePath, 'utf8'))
      }
      return {
        name: manifest.name ?? e.name,
        version: manifest.version ?? '',
        homepage: manifest.homepage,
        license: manifest.license,
        licenseText: parts.length ? parts.join('\n') : null,
        bundledIn: packageName,
      }
    })
}

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
        'scyclone-funk-drums': './scyclone-funk-drums.html',
        licenses: './licenses.html',
      },
      output: { format: 'es' },
      plugins: [
        license({
          thirdParty: {
            includePrivate: false,
            output: {
              file: path.resolve(__dirname, 'dist', 'THIRD_PARTY_LICENSES.txt'),
              template(deps) {
                const all = [
                  ...deps,
                  ...INLINED_BUNDLED_DEPS.map(readInlinedDep),
                  ...PACKAGES_WITH_BUNDLED_LICENSES.flatMap(readBundledLicenses),
                ]
                return all
                  .map(
                    (d: any) =>
                      `${'='.repeat(80)}\n` +
                      `${d.name}${d.version ? '@' + d.version : ''}` +
                      (d.bundledIn ? ` (bundled into ${d.bundledIn})` : '') +
                      (d.homepage ? `\n${d.homepage}` : '') +
                      `\nLicense: ${d.license ?? 'UNKNOWN'}\n` +
                      `${'='.repeat(80)}\n\n` +
                      (d.licenseText ?? '(license text not found in package)') +
                      '\n',
                  )
                  .join('\n')
              },
            },
          },
        }),
      ],
    },
  },
  worker: { format: 'es' },
  server: { headers: CORS_HEADERS, fs: { strict: false } },
  preview: { headers: CORS_HEADERS },
})
