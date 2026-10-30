import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import 'highlight.js/styles/tokyo-night-dark.css'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)

// The line-numbers plugin expects window.hljs; assign before dynamic import
;(window as any).hljs = hljs
await import('highlightjs-line-numbers.js')

// A tab's text: a file the page imports as text (`?raw`), or one fetched from a URL.
type SourceFile = { name: string; language?: string } & ({ code: string } | { url: URL })

// A JSON file the site serves from public/ (a model or contract config), fetched from the URL the
// demo itself loads it from (setup.ts): Vite does not let JavaScript import a public/ file, and the
// tab shows exactly the file the page uses.
export const servedJson = (name: string): SourceFile => ({
  name,
  url: new URL(name, new URL(import.meta.env.BASE_URL, location.href)),
  language: 'json',
})

const readSource = async (file: SourceFile): Promise<string> => {
  if ('code' in file) return file.code
  try {
    const response = await fetch(file.url)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.text()
  } catch (error) {
    return `Could not load ${file.url}: ${error}`
  }
}

export async function renderSourceCode(
  container: HTMLElement,
  files: SourceFile[]
): Promise<void> {
  if (files.length === 0) return
  const sources = await Promise.all(files.map(readSource))

  // Build tabs
  const tabBar = document.createElement('div')
  tabBar.className = 'source-tabs'

  const codeContainer = document.createElement('div')
  codeContainer.className = 'source-code-container'

  files.forEach((file, i) => {
    // Tab button
    const tab = document.createElement('button')
    tab.className = 'source-tab' + (i === 0 ? ' source-tab--active' : '')
    tab.textContent = file.name
    tab.addEventListener('click', () => {
      tabBar.querySelectorAll('.source-tab').forEach(t => t.classList.remove('source-tab--active'))
      tab.classList.add('source-tab--active')
      codeContainer.querySelectorAll('.source-panel').forEach(p => (p as HTMLElement).hidden = true)
      panels[i].hidden = false
    })
    tabBar.appendChild(tab)
  })

  // Build code panels
  const panels: HTMLElement[] = []
  files.forEach((file, i) => {
    const panel = document.createElement('div')
    panel.className = 'source-panel'
    panel.hidden = i !== 0

    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'hljs'
    const lang = file.language ?? 'typescript'
    const highlighted = hljs.highlight(sources[i], { language: lang }).value
    code.innerHTML = (hljs as any).lineNumbersValue(highlighted)
    pre.appendChild(code)
    panel.appendChild(pre)
    panels.push(panel)
    codeContainer.appendChild(panel)
  })

  // Only show tabs if multiple files
  if (files.length > 1) {
    container.appendChild(tabBar)
  }
  container.appendChild(codeContainer)
}
