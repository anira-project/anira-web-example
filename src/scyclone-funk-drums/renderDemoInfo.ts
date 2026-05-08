import sourceCode from './index.ts?raw'
import controlsSource from './controls.ts?raw'
import demoUISource from '../utils/setupDemoUI.ts?raw'
import { renderSourceCode } from '../utils/renderSourceCode'
import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'
import signalFlowUrl from './signal-flow.svg?url'

renderSourceCode(document.getElementById('source-code-container')!, [
  { name: 'index.ts', code: sourceCode },
  { name: 'controls.ts', code: controlsSource },
  { name: 'setupDemoUI.ts', code: demoUISource },
])

renderDescription(
  document.getElementById('demo-description')!,
  descriptionMd.replace('$SIGNAL_FLOW_SVG', signalFlowUrl)
)
