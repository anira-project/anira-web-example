import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import workerSource from './worker.ts?raw'
import jsCopyEngineSource from '../misc/JSCopyEngine.ts?raw'
import modelJson from '../../public/js-copy-stereo.model.json?raw'
import aniraSource from '../utils/anira.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'JSCopyEngine.ts', code: jsCopyEngineSource },
  { name: 'worker.ts', code: workerSource },
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  { name: 'js-copy-stereo.model.json', code: modelJson, language: 'json' },
  { name: 'anira.ts', code: aniraSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
