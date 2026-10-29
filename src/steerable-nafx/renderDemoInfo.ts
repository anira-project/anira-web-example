import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import modelJson from '../../public/steerable-nafx.model.json?raw'
import contractJson from '../../public/steerable-nafx.contract.json?raw'
import threadsSource from '../utils/inferenceThreads.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  { name: 'steerable-nafx.model.json', code: modelJson, language: 'json' },
  { name: 'steerable-nafx.contract.json', code: contractJson, language: 'json' },
  { name: 'index.ts', code: sourceCode },
  { name: 'inferenceThreads.ts', code: threadsSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
