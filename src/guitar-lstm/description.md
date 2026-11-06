# GuitarLSTM (HybridNN)

Another guitar amp simulation, this time through a hybrid LSTM/dense
network, on the module's built-in ONNX Runtime engine. Like
[Custom Pre/Post Processing](pre-post-processors.html), it has a
JavaScript processor in the audio worklet — here doing real work.

The network expects a **batched input** of shape `[512, 1, 150]`:
each of the 512 batch elements is a 150-sample context window (149
past + 1 new), and the model runs all of them in parallel to produce
512 output samples. `guitar-lstm.model.json` declares the stream: a
window of 661 samples (512 new + 149 of history) with an `overlap`
of 149, so the ring keeps the history and every inference advances
by 512 samples. Unfolding that window into the 512 overlapping batch
elements is the processor's `preProcess` (`batched-windows-processor.ts`): one native
call, `_anira_ring_pop_windows`, writes all of them, so the audio
thread does not cross the JavaScript–WASM boundary per element. It is
the pre-processing of anira's native HybridNN example
(`extras/models/hybrid-nn`) in JavaScript; anira's default
pre-processing would fill the tensor with one contiguous window.

The contract is Hard, its host blocks measured on the running context, its budget measured at
prepare by the warm-up pass, until the times are stable: what one inference takes on this
machine, at hops of 512 samples at 44.1 kHz. The model has no state, so anira's pool runs
consecutive inferences side by side, and a budget longer than a hop costs latency, not
throughput. The budget matters because one inference is cheap on a fast core but about three
times slower on an efficiency core of Apple silicon (batch 512: about 6 ms against 18), and the
pass measures the cores its Workers ran on. The 2.x demo's settings, one hop of 2048 and a budget
of exactly that hop (46.4 ms), left no room for a slow core: 208 missed quanta in 30 s of live
play in Chromium, at 104 ms of latency. An explicit budget of three hops (`"budget": {"ms":
34.8}`) left no block missed in 60 s, at 58 ms: the setting for a machine whose cores differ.
