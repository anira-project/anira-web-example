import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import processorSource from './batched-windows-processor.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode, servedJson } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'batched-windows-processor.ts', code: processorSource },
  { name: 'setup.ts', code: setupSource },
  servedJson('guitar-lstm.model.json'),
  servedJson('guitar-lstm.contract.json'),
  { name: 'index.ts', code: sourceCode },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
