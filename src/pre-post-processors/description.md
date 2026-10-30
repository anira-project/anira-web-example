# Custom Pre/Post Processing

Anira's default pre- and post-processing runs entirely in C/WASM:
popping the input ring into the model's tensors, pushing the output.
When your model needs JavaScript-side preparation between blocks —
windowing, normalisation, parameter clamping, custom multi-tensor
packing — a **JavaScript processor** takes part in those phases instead
(`defineProcessor` in the realm that runs a phase, `Pipeline.addProcessor`).

This demo is the smallest possible example: a processor whose
`preProcess` runs the default body and then **clamps the gain to at
most 1.0** in the model's input tensor. Move the slider above 1.0 and
you'll find the audio doesn't get any louder — that's the JavaScript
processor running inside the C render callback.

Under a Hard contract `preProcess` runs on the **audio thread**, in
the audio worklet's realm, so the processor's module is loaded there
(`workletModules` of `createAudioNode`). Its `prepare` and `unprepare`
run on the main thread, which imports the same module: `prepare`
allocates the tensor record `preProcess` reads the gain through, so
the audio thread allocates nothing, and hands it over as the
`prepared` pointer in the shared memory. See
[Custom Pre- and Post-Processing](https://anira-project.github.io/anira/web-api/custom_pre_post_processing.html)
for the full pattern.

The [Steerable-NAFX](steerable-nafx.html) demo needed a processor in 2.x
for its windowing; in v3 the model config declares the window and
its overlap instead.
