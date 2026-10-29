# Streaming Gain Stereo

A similar stereo gain model as
[Simple Gain Stereo](simple-gain-stereo.html), but with the gain
delivered as a **second Streamed tensor** instead of a Static scalar.
The model receives a fresh gain value for every sample, so changes
are sample-accurate rather than one per inference window.

An anira audio node feeds one Streamed input of its handler and plays
one Streamed output, so this handler has **two nodes**: one streams
the stereo audio (input and output slot 0), the other the gain (slot
1 in, the model's copy of the gain out, muted). Both render on the
context's audio thread, the handler's one driver thread, and the
handler runs an inference once both streams hold a window.

To make the sample-accurate behaviour audible, the gain stream is a
Web Audio signal: a 1 Hz `OscillatorNode` scaled and offset into the
`[0.5, 2.0]` range, connected into the gain node — no UI slider
involved. The contract's miss policy is `zeros`: a bypass would need
every output to have the audio's two channels.
