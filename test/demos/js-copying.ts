// JS Copying, offline (passthrough.ts): the worker module's JSCopyEngine.
import { loadJsCopying } from '../../src/js-copying/setup'
import { checkPassthrough } from './passthrough'

export const run = () => checkPassthrough(loadJsCopying)
