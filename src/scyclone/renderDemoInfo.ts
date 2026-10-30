import sourceCode from './index.ts?raw'
import setupSource from './setup.ts?raw'
import controlsSource from './controls.ts?raw'
import modelJson from '../../public/funk-drums.model.json?raw'
import contractJson from '../../public/rave.contract.json?raw'
import aniraSource from '../utils/anira.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'
import signalFlowUrl from './signal-flow.svg?url'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'setup.ts', code: setupSource },
  { name: 'index.ts', code: sourceCode },
  { name: 'funk-drums.model.json', code: modelJson, language: 'json' },
  { name: 'rave.contract.json', code: contractJson, language: 'json' },
  { name: 'controls.ts', code: controlsSource },
  { name: 'anira.ts', code: aniraSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(
  document.getElementById('demo-description')!,
  descriptionMd.replace('$SIGNAL_FLOW_SVG', signalFlowUrl)
)
