import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import stageSource from './gain-clamp-stage.ts?raw'
import threadsSource from '../utils/inferenceThreads.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'gain-clamp-stage.ts', code: stageSource },
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  { name: 'inferenceThreads.ts', code: threadsSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
