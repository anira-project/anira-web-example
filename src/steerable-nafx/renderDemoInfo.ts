import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode, servedJson } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  servedJson('steerable-nafx.model.json'),
  servedJson('steerable-nafx.contract.json'),
  { name: 'index.ts', code: sourceCode },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
