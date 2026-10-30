import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode, servedJson } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  servedJson('simple-gain-stereo.model.json'),
  servedJson('simple-gain-stereo.contract.json'),
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
