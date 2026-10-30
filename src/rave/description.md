# RAVE: Magnetic Resonator Piano

A streaming [RAVE](https://github.com/acids-ircam/RAVE) model running inside the browser: the
Intelligent Instruments Lab's magnetic resonator piano model, re-exported for anira's
[realtime inference workshop](https://github.com/anira-project/realtime-inference-workshop)
with its convolution caches as an explicit state. Whatever you play into it comes out as the
piano's resonances. A **Mix** slider sets the dry/wet balance.

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

## How the DSP maps to Web Audio

| Block | Implementation |
|---|---|
| RAVE inference | One handler on the built-in ONNX Runtime engine (`rave.model.json`, `rave.contract.json`), with its audio node |
| Stereo → mono downmix | `inputGain` GainNode with `channelCount=1`, `channelInterpretation='speakers'` |
| Dry/wet crossfade | `dryGain` / `wetGain` with gains summing to 1, both connected to `destination` |
| Latency compensation | `dryDelay`, a `DelayNode` on the dry path set to the handler's `latency()`, which anira derives from the model config and the contract during `prepare()` ([latency model docs](https://anira-project.github.io/anira/latency.html)): the alignment between the host's block and the model's 2048 samples, the blocks that pass while the model infers (the contract's budget of 46.4 ms), and the model's own 2224 samples. |

## Notes

- **CPU**: one inference takes most of its 46.4 ms budget on a fast machine (about 35 ms in
  Chromium on Apple silicon). Because of the state, more inference threads do not help; a
  slower machine or browser misses blocks, which play as silence.
- **Sample rate**: the model is trained at **44.1 kHz**; the `AudioContext` is pinned to 44100.
- **Model file**: 126 MB, too large for git. `fetch-models.ts` downloads it from the
  workshop's release before the dev server or a build starts.
- **License**: the model is CC BY-NC 4.0 (Intelligent Instruments Lab), see
  [the licenses page](licenses.html).
