import { renderDescription } from '../utils/renderDescription'
import { renderSourceCode, servedJson } from '../utils/renderSourceCode'
import threadsSource from '../utils/inferenceThreads.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import descriptionMd from './description.md?raw'
import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import workerSource from './worker.ts?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'worker.ts', code: workerSource },
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  servedJson('passthrough-stereo.model.json'),
  { name: 'inferenceThreads.ts', code: threadsSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
