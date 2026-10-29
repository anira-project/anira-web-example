// The site's headless browser test (Playwright): it builds the site with the check page
// (test/check.html) into test/dist, serves it with the COOP/COEP headers cross-origin isolation
// needs, and opens in each browser
// - every check page, test/check.html?check=<name>: an OfflineAudioContext rendered through a
//   demo's anira chain (the same function the demo page calls), its numbers checked; the verdict
//   is window.anira_test_result;
// - every demo page: it must reach "ready" (the loading overlay removed) and play for a moment
//   after a click on Play, with no console error, no page error and no refused load.
// Then the same pages once more under Vite's dev server, which serves the linked package
// (file:../anira/web) from outside the project root. Live audio is not observable headless: the
// demo pages are smoke-run only, by ear is for a person.
// usage: node test/run.mjs [chromium|firefox|all] [build|dev|both]
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
const CHECKS = ['smoke']
const PAGES = ['index.html', 'licenses.html']
// The demo pages: they build an anira chain on load and have a Play button.
const DEMOS = []

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

// One page: the console and the page errors are failures, and so is a load the browser refused
// (Firefox's "Security Error: Content at ... may not load or link to file:///...").
const open = async (browser, url) => {
  const page = await browser.newPage()
  const errors = []
  page.on('console', (message) => {
    const text = message.text()
    console.log(`page ${message.type()}: ${text}`)
    if (message.type() === 'error' || /Security Error|may not load or link to/.test(text))
      errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`))
  page.on('requestfailed', (request) =>
    errors.push(`request failed: ${request.url()} (${request.failure()?.errorText})`)
  )
  await page.goto(url)
  return { page, errors }
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

const runPage = async (browser, base, pathname, demo) => {
  const { page, errors } = await open(browser, `${base}${pathname}`)
  try {
    const crossOriginIsolated = await page.evaluate(() => crossOriginIsolated)
    if (crossOriginIsolated) console.log('ok: the page is cross-origin isolated')
    else fail('the page is not cross-origin isolated')
    if (demo) {
      await page.waitForFunction(
        () => !document.getElementById('loading-indicator'),
        null,
        {
          timeout: 120000,
        }
      )
      console.log('ok: the demo is ready (the loading overlay is gone)')
      await page.click('#audio-toggle')
      await page.waitForTimeout(2000)
      const label = await page.textContent('#audio-toggle')
      if (label === 'Pause') console.log('ok: the demo plays after a click on Play')
      else fail(`the demo does not play after a click on Play (the button says ${label})`)
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
  const browser = await browserType.launch()
  try {
    for (const mode of modes) {
      const server = mode === 'build' ? await serveStatic() : await serveDev()
      try {
        for (const check of CHECKS) {
          console.log(`-- ${name} ${mode}: check ${check}`)
          await runCheck(browser, server.url, check)
        }
        for (const pathname of [...PAGES, ...DEMOS]) {
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
