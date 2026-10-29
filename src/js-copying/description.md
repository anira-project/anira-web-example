# JS Copying

A user-written custom inference engine. Where
[JS Callback](js-callback.html) defines a passthrough inline, this
demo ships the full recipe documented in
[Custom Inference Backends](https://anira-project.github.io/anira/web-api/custom_inference_backends.html):

- A `JSCopyEngine` class implementing anira's `Engine` interface, with
  an `init` (awaited before the Worker's loop) and a `process` that
  reads each tensor's shape and copies the samples through the shared
  WebAssembly memory, sample by sample, in JavaScript.
- A small worker module (`worker.ts`) that defines the engine under
  its id with `defineEngine`; the context names it, and every
  inference Worker imports it in its own realm, so each Worker builds
  its own engine.
- Main-thread wiring that names the engine in the model config and
  registers it on the pipeline.

As with [JS Callback](js-callback.html), no model is actually
loaded — the engine copies input to output, so what you hear is the
unmodified audio. The point is the plumbing. Use this as the template
when writing your own JavaScript-side inference engine — e.g.
wrapping a different runtime or patching in a stub for testing. Its
`process` must be synchronous: a Worker's event loop does not run
while it is inside its inference loop.
