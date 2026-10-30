import * as fs from 'node:fs'
import * as path from 'node:path'
import { Options } from 'rollup-plugin-license'

// @anira-project/anira pre-bundles onnxruntime-web, so rollup-plugin-license can't see
// it as a transitive dep. List packages here that are inlined into other
// bundled deps and need attribution anyway.
const INLINED_BUNDLED_DEPS = ['onnxruntime-web']

// Packages whose `dist/licenses/` directory should be scanned for nested
// attribution (typically because the package statically links native deps
// into a WASM blob). Each subdirectory under `dist/licenses/` is treated as
// one attributed component, populated by that package's build (e.g. anira's
// cmake/BuildWasm.cmake).
const PACKAGES_WITH_BUNDLED_LICENSES = ['@anira-project/anira']

// Manual attributions for content that isn't pulled in via npm but is still
// part of the deployed bundle (e.g. ported source, bundled model files).
// Each entry is rendered into THIRD_PARTY_LICENSES.txt verbatim.
const MANUAL_ATTRIBUTIONS = [
  {
    name: 'Magnetic resonator piano RAVE model (Intelligent Instruments Lab)',
    version: '',
    homepage: 'https://huggingface.co/Intelligent-Instruments-Lab/rave-models',
    license: 'CC-BY-NC-4.0',
    licenseText: `The RAVE demo's model file rave.onnx, served from /public, is
model_forward.onnx of anira's realtime inference workshop
(https://github.com/anira-project/realtime-inference-workshop, release
"workshop-model"), fetched at build time by fetch-models.ts.

It is a re-export of the Intelligent Instruments Lab's magnetic resonator
piano model mrp_strengjavera_b2048_r44100_z16.ts
(https://huggingface.co/Intelligent-Instruments-Lab/rave-models), a RAVE
model (https://github.com/acids-ircam/RAVE), licensed under Creative
Commons Attribution-NonCommercial 4.0 International (CC-BY-NC-4.0).

Changes made: the workshop's scripts/export_model.py re-runs the model from
its TorchScript weights with every convolution cache passed in and out as
one state tensor, and exports it to ONNX; the encoder takes the posterior
mean and the decoder fills the cropped latent dimensions with zeros, where
the original samples noise. The weights are unchanged.

This demo is non-commercial; downstream redistribution must preserve
attribution and the NonCommercial term.

Full text: https://creativecommons.org/licenses/by-nc/4.0/legalcode

Summary: You are free to share and adapt the material for any
non-commercial purpose, provided you give appropriate credit, link to the
license, and indicate if changes were made.

Attribution: "Magnetic resonator piano RAVE model — Intelligent Instruments
Lab (https://huggingface.co/Intelligent-Instruments-Lab/rave-models)".
`,
  },
] satisfies Array<{
  name: string
  version: string
  homepage: string
  license: string
  licenseText: string
}>

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

export const licenseConfig = {
  thirdParty: {
    includePrivate: false,
    output: {
      file: path.resolve(__dirname, 'dist', 'THIRD_PARTY_LICENSES.txt'),
      template(deps) {
        const all = [
          ...deps,
          ...INLINED_BUNDLED_DEPS.map(readInlinedDep),
          ...PACKAGES_WITH_BUNDLED_LICENSES.flatMap(readBundledLicenses),
          ...MANUAL_ATTRIBUTIONS,
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
              '\n'
          )
          .join('\n')
      },
    },
  },
} satisfies Options
