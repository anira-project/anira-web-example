import sourceCode from './index.ts?raw'
import workerSource from './customInferenceWorker.ts?raw'
import jsCopyBackendSource from '../misc/JSCopyBackend.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'index.ts', code: sourceCode },
  { name: 'customInferenceWorker.ts', code: workerSource },
  { name: 'JSCopyBackend.ts', code: jsCopyBackendSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
