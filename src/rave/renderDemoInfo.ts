import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import workerSource from './worker.ts?raw'
import controlsSource from './controls.ts?raw'
import aniraSource from '../utils/anira.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode, servedJson } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  { name: 'worker.ts', code: workerSource },
  servedJson('rave.model.json'),
  servedJson('rave.contract.json'),
  { name: 'index.ts', code: sourceCode },
  { name: 'controls.ts', code: controlsSource },
  { name: 'anira.ts', code: aniraSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
