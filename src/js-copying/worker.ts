// The context's worker module: every inference Worker imports it before its loop and defines
// the demo's engine on its own registry.
import { defineEngine } from '@anira-project/anira/scope'
import { jsCopyEngine } from '../misc/JSCopyEngine'

/** The engine's reverse-URI id: the model entry names it, the pipeline registers it. */
export const JS_COPY_ENGINE = 'org.anira-web-example.js-copy'

defineEngine(JS_COPY_ENGINE, jsCopyEngine)
