// JS Copying, offline (passthrough.ts): the worker module's JSCopyEngine.
import { createJsCopying } from '../../src/js-copying/setup'
import { checkPassthrough } from './passthrough'

export const run = () => checkPassthrough(createJsCopying)
