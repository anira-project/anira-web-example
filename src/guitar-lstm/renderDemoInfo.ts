import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import stageSource from './batched-windows-stage.ts?raw'
import modelJson from '../../public/guitar-lstm.model.json?raw'
import contractJson from '../../public/guitar-lstm.contract.json?raw'
import threadsSource from '../utils/inferenceThreads.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'batched-windows-stage.ts', code: stageSource },
  { name: 'setup.ts', code: setupSource },
  { name: 'guitar-lstm.model.json', code: modelJson, language: 'json' },
  { name: 'guitar-lstm.contract.json', code: contractJson, language: 'json' },
  { name: 'index.ts', code: sourceCode },
  { name: 'inferenceThreads.ts', code: threadsSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
