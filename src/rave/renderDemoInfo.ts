import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import controlsSource from './controls.ts?raw'
import modelJson from '../../public/rave.model.json?raw'
import contractJson from '../../public/rave.contract.json?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  { name: 'rave.model.json', code: modelJson, language: 'json' },
  { name: 'rave.contract.json', code: contractJson, language: 'json' },
  { name: 'index.ts', code: sourceCode },
  { name: 'controls.ts', code: controlsSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(document.getElementById('demo-description')!, descriptionMd)
