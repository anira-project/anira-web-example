# RAVE: Magnetic Resonator Piano

A streaming [RAVE](https://github.com/acids-ircam/RAVE) model running inside the browser: the
Intelligent Instruments Lab's magnetic resonator piano model, re-exported for anira's
[realtime inference workshop](https://github.com/anira-project/realtime-inference-workshop)
with its convolution caches as an explicit state. Whatever you play into it comes out as the
piano's resonances. A **Mix** slider sets the dry/wet balance.

The input is the workshop's demo, slow synthesized chords (`chords.wav`), the kind of sound the
model was trained on; **Load audio** plays your own. On drums this model mostly falls silent: a
drum loop comes out near-silent for about 60 % of its length, and so does the original model
run as RAVE runs it, over the whole loop at once. That is the model, not the streaming.

## The model and its state

`rave.onnx` takes 2048 samples at 44.1 kHz and a state tensor of 63488 values (every cache of
the causal convolutions) and returns 2048 samples and the new state. `rave.model.json`
declares the pair: `state_in` has the role `state` and is fed from `state_out`
(`"state_source": "state_out"`). anira carries the state from one inference to the next
inside the module, starts a new stream from zeros, and runs the handler's inferences one at a
time, since each needs the state of the one before. No JavaScript touches the state.

The model is causal and streams in blocks of 2048, so the blocks join without seams: the
output is the same as running the model over the whole signal at once. Its output answers the
input 2224 samples later (the strides and transposed convolutions of the network, and the
filter bank), declared as the output's `"latency": 2224`. `max_instances` is 1: each instance
would hold its own copy of the 126 MB model, and the state lets only one inference run at a
time anyway.

## Two threads per inference

The state rules out the usual way to keep up: anira cannot run the next block's inference on
a second inference thread, because it needs the state of the one before. So the time one
inference takes is what decides, and on one thread it is too long: about 50 ms per block in
Chromium on Apple silicon, against a block of 46.4 ms, and every block that comes late is a
miss. The model therefore runs on anira's ONNX Runtime Web engine with **two intra-op
threads** (`onnxRuntimeWeb({ numThreads: 2 })` in `worker.ts`, the context's worker module):
onnxruntime-web starts one Worker of its own in the inference Worker, and each inference is
split across the two. That brings a block to about 37 ms. The context has one inference thread,
since a second would only wait. anira's built-in ONNX Runtime engine (`"engine":
"onnxruntime"`) runs one thread in the browser, as the module starts no pthread of its own.

## A warm start, and bypass on a miss

The first inferences of a session are slow while onnxruntime-web sets itself up, and anira's
warm-up (a contract's `"warmup"`) runs on its built-in engines only. So the engine gets the
model itself (`onnxRuntimeWeb({ model, warmup: 3 })`): it fetches `rave.onnx`, creates its
session and runs three inferences over zeros in its init, before the inference Worker's loop,
and the page creates the audio node once that Worker is ready. Over the config's model entry
the session would only come at the first call, inside the stream. The page fetches no model
file of its own (`fetchModel: () => false`), so the model is loaded once.

A block that still misses plays the input instead of silence (`"on_miss": "bypass"` in
`rave.contract.json`).

## How the DSP maps to Web Audio

| Block | Implementation |
|---|---|
| RAVE inference | One handler (`rave.model.json`, `rave.contract.json`) on the ONNX Runtime Web engine with two threads per inference, defined in the context's worker module (`worker.ts`), with its audio node |
| Stereo → mono downmix | `inputGain` GainNode with `channelCount=1`, `channelInterpretation='speakers'` |
| Dry/wet crossfade | `dryGain` / `wetGain` with gains summing to 1, both connected to `destination` |
| Latency compensation | `dryDelay`, a `DelayNode` on the dry path set to the handler's `latency()`, which anira derives from the model config and the contract during `prepare()` ([latency model docs](https://anira-project.github.io/anira/latency.html)): the alignment between the host's block and the model's 2048 samples, the blocks that pass while the model infers (the contract's budget of 46.4 ms), and the model's own 2224 samples. |

## Notes

- **CPU**: even on two threads a block takes about 37 of its 46.4 ms on a fast machine
  (Chromium on Apple silicon). A slower machine or browser, or a thread the system puts on an
  efficiency core, misses blocks, which play the input. More than two threads was slower here
  (about 47 ms with four), as the slowest thread holds each inference up.
- **Sample rate**: the model is trained at **44.1 kHz**; the `AudioContext` is pinned to 44100.
- **Model file**: 126 MB, too large for git. `fetch-models.ts` downloads it from the
  workshop's release before the dev server or a build starts.
- **License**: the model is CC BY-NC 4.0 (Intelligent Instruments Lab), and so is the input
  (the workshop's), see [the licenses page](licenses.html).
