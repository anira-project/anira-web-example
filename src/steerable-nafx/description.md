# Steerable-NAFX (CNN)

Guitar amp simulation through a small CNN-based neural audio
effect. Builds directly on the
[Custom Pre/Post Processing](/pre-post-processors.html) demo: the
mechanism is the same `JSPrePostProcessor` subclass overriding
`preProcess`, but here it does real work instead of clamping a
parameter.

The CNN expects a **sliding window** input — every inference receives
the new block of audio prepended with `CNN_RECEPTIVE_FIELD` (132)
samples of past context, so the convolutions have something to look
back at. The override calls
`_prepostprocessor_pop_samples_from_buffer_window` directly on the
WASM instance to assemble that overlap from the input ring buffer
each block, skipping the
[wrapper allocation cost]($DOCS_URL/web-api/custom_pre_post_processing.html#pointer-arguments)
in the real-time path.

The wider topic — when to use a `JSPrePostProcessor` and the full
two-thread setup — is covered in
[Custom Pre- and Post-Processing]($DOCS_URL/web-api/custom_pre_post_processing.html).
