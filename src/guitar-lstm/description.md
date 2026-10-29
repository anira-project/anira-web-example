# GuitarLSTM (HybridNN)

Another guitar amp simulation, this time through a hybrid LSTM/dense
network, on the module's built-in ONNX Runtime engine. Like
[Custom Pre/Post Processing](pre-post-processors.html), it has a
JavaScript stage in the audio worklet — here doing real work.

The network expects a **batched input** of shape `[2048, 1, 150]`:
each of the 2048 batch elements is a 150-sample context window (149
past + 1 new), and the model runs all of them in parallel to produce
2048 output samples. `guitar-lstm.model.json` declares the stream: a
window of 2197 samples (2048 new + 149 of history) with an `overlap`
of 149, so the ring keeps the history and every inference advances
by 2048 samples. Unfolding that window into the 2048 overlapping batch
elements is the stage's `preProcess` (`batched-windows-stage.ts`): one native
call, `_anira_ring_pop_windows`, writes all of them, so the audio
thread does not cross the JavaScript–WASM boundary per element. It is
the pre-processing of anira's native HybridNN example
(`extras/models/hybrid-nn`) in JavaScript; anira's default
pre-processing would fill the tensor with one contiguous window.

The contract is Hard at the render quantum: 46.4 ms per inference
(2048 samples at 44.1 kHz, the real-time threshold of the 2.x demo)
and 2 warm-up runs.
