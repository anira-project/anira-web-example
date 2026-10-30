import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import processorSource from './gain-clamp-processor.ts?raw'
import aniraSource from '../utils/anira.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'gain-clamp-processor.ts', code: processorSource },
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  { name: 'anira.ts', code: aniraSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
