# Streaming Gain Stereo

A similar stereo gain plugin as
[Simple Gain Stereo](/simple-gain-stereo.html), but with the gain
delivered as a **second streamable tensor** instead of a scalar
input. This means the model receives a fresh gain value for every
sample, so changes are sample-accurate rather than block-quantised.

To deliver the gain that way, this demo introduces two pieces of
machinery:

- A **custom audio worklet** that subclasses `AniraAudioWorkletBase`
  and calls `processMulti` with a `float***` pointer structure
  covering both tensors. The base class's `buildMultiTensorPointers`
  helper does the heavy lifting — see
  [Custom Audio Worklets]($DOCS_URL/web-api/custom_audio_worklets.html).
- A Web Audio `AudioParam` declared via `parameterDescriptors`. The
  worklet copies the parameter's per-sample values into the gain
  tensor on every block. To make the sample-accurate behaviour
  audible, the demo drives that `AudioParam` directly from a Web
  Audio `OscillatorNode` (a 1 Hz LFO scaled and DC-offset into the
  `[0.5, 2.0]` range) — no UI slider involved.
