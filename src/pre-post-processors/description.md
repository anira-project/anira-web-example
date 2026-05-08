# Custom Pre/Post Processing

Anira's default `PrePostProcessor` runs entirely in C++/WASM. When
your model needs JavaScript-side preparation between blocks —
windowing, normalisation, parameter clamping, custom multi-tensor
packing —
[`JSPrePostProcessor`](https://anira-project.github.io/anira/web-api/reference/class/JSPrePostProcessor.html)
routes the pre- and post-processing phases through JS callbacks
instead.

This demo is the smallest possible example: a `JSPrePostProcessor`
subclass that **clamps the gain to `[0, 1]`** in `preProcess` before
the C++ side reads it. Move the slider above 1.0 and you'll find the
audio doesn't get any louder — that's the JS callback firing every
block.

The override has to live on the **audio worklet thread** (where the
real-time callback runs), so the construction is split: the main
thread allocates a `JSPrePostProcessor`, the worklet reconstructs it
as the subclass via `createFromPointer` and registers it with
`aniraWeb.registerPrePostProcessor`. See
[Custom Pre- and Post-Processing](https://anira-project.github.io/anira/web-api/custom_pre_post_processing.html)
for the full pattern.

The [steerable-nafx](/steerable-nafx.html) and
[guitar-lstm](/guitar-lstm.html) demos use this same mechanism for
real windowing logic.
