# GuitarLSTM (HybridNN)

Another guitar amp simulation, this time through a hybrid LSTM/dense
network. Like [steerable-nafx](/steerable-nafx.html), this builds on
the [Custom Pre/Post Processing](/pre-post-processors.html) demo —
same `JSPrePostProcessor` mechanism, different windowing problem.

The LSTM expects a **batched input** of size `[BUFFER_SIZE, 1, 150]`:
each of the `BUFFER_SIZE` batch elements is a 150-sample context
window (149 past + 1 new), and the model runs all of them in
parallel. The `preProcess` override loops over the batch and calls
`_prepostprocessor_pop_samples_from_buffer_window_offset` for each,
slotting each batch element's window into the right offset in the
input tensor.

The wider topic — when to use a `JSPrePostProcessor` and the full
two-thread setup — is covered in
[Custom Pre- and Post-Processing](https://anira-project.github.io/anira/web-api/custom_pre_post_processing.html).
