import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import workerSource from './worker.ts?raw'
import modelJson from '../../public/simple-gain-stereo-ort-web.model.json?raw'
import contractJson from '../../public/simple-gain-stereo.contract.json?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  { name: 'worker.ts', code: workerSource },
  { name: 'index.ts', code: sourceCode },
  { name: 'simple-gain-stereo-ort-web.model.json', code: modelJson, language: 'json' },
  { name: 'simple-gain-stereo.contract.json', code: contractJson, language: 'json' },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
