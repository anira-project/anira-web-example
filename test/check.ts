// The check page (check.html?check=<name>): runs one check module and leaves its verdict in
// window.anira_test_result for test/run.mjs.
import type { Checks } from './common'

const modules: Record<string, () => Promise<{ run: () => Promise<Checks> }>> = {
  smoke: () => import('./smoke/check'),
  'simple-gain-stereo': () => import('./demos/simple-gain-stereo'),
  'onnxweb-backend': () => import('./demos/onnxweb-backend'),
  'pre-post-processors': () => import('./demos/pre-post-processors'),
  'steerable-nafx': () => import('./demos/steerable-nafx'),
  'streaming-gain-stereo': () => import('./demos/streaming-gain-stereo'),
  'js-callback': () => import('./demos/js-callback'),
  'js-copying': () => import('./demos/js-copying'),
  'guitar-lstm': () => import('./demos/guitar-lstm'),
}

type Result = { checks: Checks } | { error: string }

declare global {
  interface Window {
    anira_test_result?: Result
  }
}

const run = async (): Promise<Result> => {
  const name = new URLSearchParams(location.search).get('check') ?? ''
  const load = modules[name]
  if (!load)
    throw new Error(`no check '${name}': one of ${Object.keys(modules).join(', ')}`)
  const checks: Checks = [
    { ok: crossOriginIsolated, what: 'the page is cross-origin isolated (COOP/COEP)' },
  ]
  checks.push(...(await (await load()).run()))
  return { checks }
}

run()
  .then((result) => (window.anira_test_result = result))
  .catch((error: unknown) => {
    window.anira_test_result = {
      error: error instanceof Error ? `${error}\n${error.stack ?? ''}` : String(error),
    }
  })
