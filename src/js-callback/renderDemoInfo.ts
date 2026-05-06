import { renderDescription } from '../utils/renderDescription'
import { renderSourceCode } from '../utils/renderSourceCode'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import descriptionMd from './description.md?raw'
import sourceCode from './index.ts?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'index.ts', code: sourceCode },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
