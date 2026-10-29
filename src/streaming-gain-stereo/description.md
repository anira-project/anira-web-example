# Streaming Gain Stereo

A similar stereo gain model as
[Simple Gain Stereo](simple-gain-stereo.html), but with the gain
delivered as a **second Streamed tensor** instead of a Static scalar.
The model receives a fresh gain value for every sample, so changes
are sample-accurate rather than one per inference window.

The handler's audio node serves every Streamed slot of the model: it
has one Web Audio input and one output per slot — input 0 the stereo
audio, input 1 the mono gain stream; output 0 the processed audio,
output 1 the model's copy of the gain, which goes nowhere — and hands
all of them to the handler together each quantum. No custom worklet.

To make the sample-accurate behaviour audible, the gain stream is a
Web Audio signal: a 1 Hz `OscillatorNode` scaled and offset into the
`[0.5, 2.0]` range, connected into the node's second input — no UI
slider involved. The contract's miss policy is `zeros`: a bypass would
need every output to have the audio's two channels.
