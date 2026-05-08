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
    name: 'Scyclone',
    version: '',
    homepage: 'https://github.com/Torsion-Audio/Scyclone',
    license: 'MIT (ported source) AND CC-BY-NC-4.0 (bundled .onnx models)',
    licenseText: `Scyclone is multi-licensed (GPL-3.0 OR MIT OR CC-BY-NC-4.0).
SPDX-License-Identifier: GPL-3.0 OR MIT OR CC-BY-NC-4.0
See: https://github.com/Torsion-Audio/Scyclone/blob/main/LICENSE.md

What is reused in this demo, and under which license:

  1. The ONNX model files funk_drums.onnx and djembe.onnx, served from
     /public, are copied verbatim from Scyclone/assets/models/. These are
     licensed under Creative Commons Attribution-NonCommercial 4.0
     International (CC-BY-NC-4.0). This demo is non-commercial; downstream
     redistribution must preserve attribution and the NonCommercial term.

------------------------------------------------------------------------
MIT License (applies to the ported transient splitter / envelope code):

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

------------------------------------------------------------------------
CC-BY-NC-4.0 (applies to funk_drums.onnx and djembe.onnx):

Full text: https://creativecommons.org/licenses/by-nc/4.0/legalcode

Summary: You are free to share and adapt the material for any
non-commercial purpose, provided you give appropriate credit, link to the
license, and indicate if changes were made.

Attribution: "Scyclone — Torsion-Audio
(https://github.com/Torsion-Audio/Scyclone)". Models are bundled
unmodified.
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
