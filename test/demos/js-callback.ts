// JS Callback, offline (passthrough.ts): the worker module's passthrough engine.
import { loadJsCallback } from '../../src/js-callback/setup'
import { checkPassthrough } from './passthrough'

export const run = () => checkPassthrough(loadJsCallback, { ownThread: true })
