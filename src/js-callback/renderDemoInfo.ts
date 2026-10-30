import { renderDescription } from '../utils/renderDescription'
import { renderSourceCode } from '../utils/renderSourceCode'
import threadsSource from '../utils/inferenceThreads.ts?raw'
import aniraSource from '../utils/anira.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import modelJson from '../../public/passthrough-stereo.model.json?raw'
import descriptionMd from './description.md?raw'
import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import workerSource from './worker.ts?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'worker.ts', code: workerSource },
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  { name: 'passthrough-stereo.model.json', code: modelJson, language: 'json' },
  { name: 'inferenceThreads.ts', code: threadsSource },
  { name: 'anira.ts', code: aniraSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
