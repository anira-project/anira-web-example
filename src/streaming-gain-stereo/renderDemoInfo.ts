import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import modelJson from '../../public/streaming-gain-stereo.model.json?raw'
import contractJson from '../../public/streaming-gain-stereo.contract.json?raw'
import threadsSource from '../utils/inferenceThreads.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  { name: 'streaming-gain-stereo.model.json', code: modelJson, language: 'json' },
  { name: 'streaming-gain-stereo.contract.json', code: contractJson, language: 'json' },
  { name: 'inferenceThreads.ts', code: threadsSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
