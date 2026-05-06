import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import 'highlight.js/styles/tokyo-night-dark.css'

hljs.registerLanguage('typescript', typescript)

// The line-numbers plugin expects window.hljs; assign before dynamic import
;(window as any).hljs = hljs
await import('highlightjs-line-numbers.js')

interface SourceFile {
  name: string
  code: string
  language?: string
}

export function renderSourceCode(
  container: HTMLElement,
  files: SourceFile[]
) {
  if (files.length === 0) return

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
    const highlighted = hljs.highlight(file.code, { language: lang }).value
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
