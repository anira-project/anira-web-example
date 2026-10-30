// The model files too large for git, fetched into public/ (gitignored) and checked against their
// SHA-256 before the dev server or a build starts. The RAVE demo's model is
// model_forward.onnx of anira's realtime inference workshop (its release `workshop-model`):
// 126 MB, above GitHub's 100 MB per file. A file already there and intact is left alone, so a
// second run needs no network. RAVE_MODEL=/path/to/model_forward.onnx copies a local file
// instead (checked the same way).
// usage: the Vite plugin fetchModels() (vite.config.ts), or `node fetch-models.ts` on its own.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')

type ModelFile = {
  /** Its name in public/, where the model config's path finds it. */
  file: string
  url: string
  sha256: string
  /** The environment variable naming a local copy to use instead of the download. */
  localEnv: string
}

const MODEL_FILES: ModelFile[] = [
  {
    file: 'rave.onnx',
    url: 'https://github.com/anira-project/realtime-inference-workshop/releases/download/workshop-model/model_forward.onnx',
    sha256: 'a75d50597aa8d4287ba5de73fd933d2df1c0f07c99539f5c88b1d7f694ad6f26',
    localEnv: 'RAVE_MODEL',
  },
]

const sha256Of = async (file: string): Promise<string> => {
  const hash = createHash('sha256')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

const fetchModelFile = async (model: ModelFile, log: (message: string) => void) => {
  const destination = path.join(PUBLIC, model.file)
  if (fs.existsSync(destination) && (await sha256Of(destination)) === model.sha256) return
  // Written beside it and renamed once checked: an interrupted fetch leaves no file that looks
  // complete.
  const partial = `${destination}.part`
  const local = process.env[model.localEnv]
  if (local) {
    log(`${model.file}: copying ${local}`)
    fs.copyFileSync(local, partial)
  } else {
    log(`${model.file}: downloading ${model.url}`)
    const response = await fetch(model.url)
    if (!response.ok || !response.body) {
      throw new Error(
        `${model.file}: ${response.status} ${response.statusText} from ${model.url}; ` +
          `set ${model.localEnv}=/path/to/the/file to use a local copy`
      )
    }
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial))
  }
  const actual = await sha256Of(partial)
  if (actual !== model.sha256) {
    fs.rmSync(partial)
    throw new Error(
      `${model.file}: SHA-256 ${actual} from ${local ?? model.url}, expected ${model.sha256}`
    )
  }
  fs.renameSync(partial, destination)
  log(`${model.file}: ready`)
}

/** Every model file in public/, fetched where it is missing or does not match its hash. */
export const fetchModelFiles = async (log: (message: string) => void = console.log) => {
  for (const model of MODEL_FILES) await fetchModelFile(model, log)
}

/** The Vite plugin: the model files before the dev server or a build starts. */
export const fetchModels = (): Plugin => ({
  name: 'fetch-models',
  buildStart: () => fetchModelFiles((message) => console.log(`[fetch-models] ${message}`)),
})

const ranDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (ranDirectly) await fetchModelFiles()
