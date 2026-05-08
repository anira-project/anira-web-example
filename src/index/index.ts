import { renderDescription } from '../utils/renderDescription'
import descriptionMd from './description.md?raw'

renderDescription(document.getElementById('page-description')!, descriptionMd)
