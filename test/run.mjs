// The site's headless browser test (Playwright): it builds the site with the check page
// (test/check.html) into test/dist, serves it with the COOP/COEP headers cross-origin isolation
// needs, and opens in each browser
// - every check page, test/check.html?check=<name>: an OfflineAudioContext rendered through a
//   demo's anira chain (the same function the demo page calls), its numbers checked; the verdict
//   is window.anira_test_result;
// - every demo page: it must reach "ready" (the loading overlay removed, the context's default
//   pool in its loops; on JS Callback's page + / − Worker count up and down) and play for a
//   moment after a click on Play, with no console error, no page error and no refused load.
// Then the same pages once more under Vite's dev server, which serves the linked package
// (file:../anira/web) from outside the project root. Live audio is not observable headless: the
// demo pages are smoke-run only, by ear is for a person.
// usage: node test/run.mjs [chromium|firefox|all] [build|dev|both] [name,...]
//   the names (a check's or a page's, e.g. steerable-nafx or index.html) run those alone.
//   PLAYWRIGHT_BROWSERS_PATH points at the installed browsers (npx playwright install chromium
//   firefox). Exit code 0 when every check passed.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox } from 'playwright'
import { build, createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configFile = path.join(root, 'vite.config.ts')
const outDir = path.join(root, 'test/dist')

// The check modules of test/check.ts and the demo pages, by the name the site gives them.
const CHECKS = [
  'smoke',
  'simple-gain-stereo',
  'onnxweb-backend',
  'pre-post-processors',
  'steerable-nafx',
  'streaming-gain-stereo',
  'js-callback',
  'js-copying',
  'guitar-lstm',
  'rave',
]
const PAGES = ['index.html', 'licenses.html']
// The demo pages: they build an anira chain on load and have a Play button.
const DEMOS = [
  'simple-gain-stereo.html',
  'onnx-runtime-web-backend.html',
  'pre-post-processors.html',
  'steerable-nafx.html',
  'streaming-gain-stereo.html',
  'js-callback.html',
  'js-copying.html',
  'guitar-lstm.html',
  'rave.html',
]

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain',
}

const serveStatic = async () => {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = path.join(outDir, pathname === '/' ? 'index.html' : pathname)
    if (!file.startsWith(outDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    })
    fs.createReadStream(file).pipe(response)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => server.close(),
  }
}

const serveDev = async () => {
  const dev = await createServer({
    configFile,
    root,
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  })
  await dev.listen()
  return { url: dev.resolvedUrls.local[0], close: () => dev.close() }
}

const browserArg = process.argv[2] ?? 'all'
const modeArg = process.argv[3] ?? 'both'
const browsers = browserArg === 'all' ? ['chromium', 'firefox'] : [browserArg]
const modes = modeArg === 'both' ? ['build', 'dev'] : [modeArg]
const only = process.argv[4]?.split(',')
const selected = (name) => !only || only.includes(name)

if (modes.includes('build')) {
  await build({
    configFile,
    root,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: { check: path.join(root, 'test/check.html') } },
    },
  })
  // The license plugin writes to dist/ whatever the outDir (licenses.ts).
  fs.copyFileSync(
    path.join(root, 'dist/THIRD_PARTY_LICENSES.txt'),
    path.join(outDir, 'THIRD_PARTY_LICENSES.txt')
  )
}

let failed = 0
const fail = (what) => {
  console.log(`FAILED: ${what}`)
  failed += 1
}

// anira's platform sink writes each record of warning level and above to stderr, which the
// module's glue prints with console.error ("[warn][rt][anira.scheduler] ..."), beside the log
// hook's console.warn of the same record: such a line is the record's level, not an error.
const platformSinkBelowError = /^\[(warn|info|debug|trace)\]/

// One page: the console and the page errors are failures, and so is a load the browser refused
// (Firefox's "Security Error: Content at ... may not load or link to file:///...").
const open = async (browser, url, initScript) => {
  const page = await browser.newPage()
  if (initScript) await page.addInitScript(initScript)
  const errors = []
  const logs = []
  page.on('console', (message) => {
    const text = message.text()
    console.log(`page ${message.type()}: ${text}`)
    logs.push(text)
    if (
      (message.type() === 'error' && !platformSinkBelowError.test(text)) ||
      /Security Error|may not load or link to/.test(text)
    )
      errors.push(text)
  })
  // A page error also ends the wait for the page (a demo that threw never gets ready).
  let pageFailed
  const failure = new Promise((_, reject) => (pageFailed = reject))
  failure.catch(() => {})
  page.on('pageerror', (error) => {
    errors.push(`page error: ${error.message}`)
    pageFailed(new Error(`the page threw: ${error.message}`))
  })
  page.on('requestfailed', (request) =>
    errors.push(`request failed: ${request.url()} (${request.failure()?.errorText})`)
  )
  await page.goto(url)
  return { page, errors, logs, failure }
}

const runCheck = async (browser, base, name) => {
  const { page, errors } = await open(browser, `${base}test/check.html?check=${name}`)
  try {
    await page.waitForFunction(() => window.anira_test_result, null, { timeout: 120000 })
    const result = await page.evaluate(() => window.anira_test_result)
    if (result.error) fail(result.error)
    else
      for (const { ok, what } of result.checks) {
        if (ok) console.log(`ok: ${what}`)
        else fail(what)
      }
  } catch (error) {
    fail(`${name}: ${error.message}`)
  }
  for (const error of errors) fail(error)
  await page.close()
}

// Whether an AudioContext can run in this browser at all: headless Firefox without a sound server
// never resumes one (the autoplay policy is off, see the launch), Chromium has a fake output.
const audioStarts = (page) =>
  page.evaluate(async () => {
    const context = new AudioContext()
    const timeout = new Promise((resolve) => setTimeout(resolve, 2000))
    await Promise.race([context.resume(), timeout])
    const running = context.state === 'running'
    void context.close()
    return running
  })

// A tap on what the page plays: every connection into an AudioContext's destination also feeds
// one AnalyserNode (window.anira_test_tap), so the harness can measure the live output.
const tapDestination = () => {
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (destination, ...rest) {
    if (destination instanceof AudioDestinationNode) {
      window.anira_test_tap ??= new AnalyserNode(destination.context, { fftSize: 4096 })
      window.anira_test_context = destination.context
      connect.call(this, window.anira_test_tap)
    }
    return connect.call(this, destination, ...rest)
  }
}

// The RMS of the last 4096 samples the page played.
const playedRms = (page) =>
  page.evaluate(() => {
    const tap = window.anira_test_tap
    if (!tap) return 0
    const samples = new Float32Array(tap.fftSize)
    tap.getFloatTimeDomainData(samples)
    return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
  })

// The latency badge shows the handler's latency, and the dry path waits exactly as long.
const checkLatency = async (page, when) => {
  const { text, delay, rate } = await page.evaluate(() => {
    const badge = document.getElementById('latency-badge')
    return {
      text: badge?.textContent ?? '',
      delay: Number(badge?.dataset.dryDelay),
      rate: window.anira_test_context?.sampleRate,
    }
  })
  const match = /^Latency: (\d+) samples \(([\d.]+) ms\)$/.exec(text)
  const samples = match ? Number(match[1]) : 0
  if (samples > 0 && Math.abs(delay - samples / rate) < 1e-6)
    console.log(`ok: ${when}, the badge says "${text}" and the dry delay is ${delay} s`)
  else
    fail(
      `${when}, the badge says "${text}" and the dry delay is ${delay} s (rate ${rate})`
    )
}

// A page on the context's default pool logs its size once the pool is in its loops.
const checkDefaultPool = (logs) => {
  const logged = logs.map((text) => /^inference threads: (\d+)$/.exec(text)).find(Boolean)
  const count = logged ? Number(logged[1]) : 0
  if (count >= 1)
    console.log(`ok: the context's default pool of ${count} inference threads is ready`)
  else fail('the page did not report a ready default pool')
}

// JS Callback starts its own inference threads: one more, then down to none and back to the
// page's own count, the badge counting.
const checkWorkerControls = async (page) => {
  const workers = () => page.textContent('#worker-count')
  const initial = Number(await workers())
  const steps = [['#add-worker', initial + 1]]
  for (let n = initial; n >= 0; n--) steps.push(['#remove-worker', n])
  for (let n = 1; n <= initial; n++) steps.push(['#add-worker', n])
  const counts = steps.map(([, n]) => n).join(', ')
  let counted = true
  for (const [button, expected] of steps) {
    await page.click(button)
    await page.waitForFunction(
      (n) => document.getElementById('worker-count')?.textContent === String(n),
      expected,
      { timeout: 10000 }
    )
    counted &&= (await workers()) === String(expected)
    // A new Worker boots first (the module, the worker module); give it that time, as a person
    // clicking would.
    if (button === '#add-worker') await page.waitForTimeout(3000)
  }
  if (counted)
    console.log(`ok: + / − Worker start and stop inference threads (${counts})`)
  else fail('the worker count did not follow + / − Worker')
}

const runPage = async (browser, base, pathname, demo) => {
  const { page, errors, logs, failure } = await open(
    browser,
    `${base}${pathname}`,
    demo ? tapDestination : undefined
  )
  try {
    const crossOriginIsolated = await page.evaluate(() => crossOriginIsolated)
    if (crossOriginIsolated) console.log('ok: the page is cross-origin isolated')
    else fail('the page is not cross-origin isolated')
    if (demo) {
      await Promise.race([
        page.waitForFunction(() => !document.getElementById('loading-indicator'), null, {
          timeout: 120000,
        }),
        failure,
      ])
      console.log('ok: the demo is ready (the loading overlay is gone)')
      await page.click('#audio-toggle')
      // The first Play builds the chain (measure, prepare, warm-up, the node) before it plays.
      await page
        .waitForFunction(
          () => document.getElementById('audio-toggle')?.textContent === 'Pause',
          null,
          {
            timeout: 60000,
          }
        )
        .catch(() => {})
      await page.waitForTimeout(2000)
      const label = await page.textContent('#audio-toggle')
      if (label === 'Pause') {
        console.log('ok: the demo plays after a click on Play')
        const rms = await playedRms(page)
        if (rms > 1e-3)
          console.log(`ok: the page's output is not silent (RMS ${rms.toFixed(4)})`)
        else fail(`the page's output is silent (RMS ${rms})`)
        await checkLatency(page, 'after the prepare')
        // A device change: the page's sinkchange listener re-measures, re-prepares the running
        // node and updates the dry delay and the badge.
        const before = logs.length
        await page.evaluate(() =>
          window.anira_test_context.dispatchEvent(new Event('sinkchange'))
        )
        // The re-measure (a probe of ~400 ms, the nodes held) and the re-prepare (with its
        // warm-up) log the plans of the new prepare (utils/anira.ts logPlans) when done.
        const deadline = Date.now() + 60000
        while (
          Date.now() < deadline &&
          !logs.slice(before).some((text) => /^plan: /.test(text))
        )
          await page.waitForTimeout(250)
        await page.waitForTimeout(500)
        const remeasured = logs.slice(before).some((text) => /^plan: /.test(text))
        if (remeasured) console.log('ok: sinkchange re-measured and re-prepared the node')
        else fail('sinkchange did not re-prepare the node')
        await checkLatency(page, 'after the sinkchange re-prepare')
        const after = await playedRms(page)
        if (after > 1e-3)
          console.log(
            `ok: the output plays on after the re-prepare (RMS ${after.toFixed(4)})`
          )
        else fail(`the output is silent after the re-prepare (RMS ${after})`)
        // A gain slider at 0 silences the model's output (the dry path is muted while wet).
        if (await page.$('#gain-slider')) {
          await page.fill('#gain-slider', '0')
          await page.waitForTimeout(1000)
          const muted = await playedRms(page)
          if (muted < 1e-4)
            console.log(`ok: the gain slider at 0 silences the output (RMS ${muted})`)
          else fail(`the gain slider at 0 leaves the output at RMS ${muted}`)
        }
        if (!(await page.$('#add-worker'))) checkDefaultPool(logs)
      } else if (!(await audioStarts(page)))
        console.log(
          'skipped: playing, the latency and the pool (no AudioContext starts in this ' +
            'browser here, so the chain is never built)'
        )
      else fail(`the demo does not play after a click on Play (the button says ${label})`)
      // JS Callback's threads exist from the page's load: its controls work in either case.
      if (await page.$('#add-worker')) await checkWorkerControls(page)
    } else {
      await page.waitForLoadState('networkidle')
    }
  } catch (error) {
    fail(`${pathname}: ${error.message}`)
  }
  for (const error of errors) fail(error)
  await page.close()
}

for (const name of browsers) {
  const browserType = { chromium, firefox }[name]
  if (!browserType) throw new Error(`no browser '${name}': chromium, firefox or all`)
  const browser = await browserType.launch({
    firefoxUserPrefs: {
      'media.autoplay.default': 0,
      'media.autoplay.block-webaudio': false,
    },
  })
  try {
    for (const mode of modes) {
      const server = mode === 'build' ? await serveStatic() : await serveDev()
      try {
        for (const check of CHECKS.filter(selected)) {
          console.log(`-- ${name} ${mode}: check ${check}`)
          await runCheck(browser, server.url, check)
        }
        for (const pathname of [...PAGES, ...DEMOS].filter(selected)) {
          console.log(`-- ${name} ${mode}: ${pathname}`)
          await runPage(browser, server.url, pathname, DEMOS.includes(pathname))
        }
      } finally {
        await server.close()
      }
    }
  } finally {
    await browser.close()
  }
}
console.log(`${failed === 0 ? 'PASSED' : 'FAILED'}: the browser test`)
process.exit(failed === 0 ? 0 : 1)
