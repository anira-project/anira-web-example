# Steerable-NAFX (CNN)

Guitar amp simulation through a small CNN-based neural audio
effect (two blocks of
[Steerable discovery of neural audio effects](https://github.com/csteinmetz1/steerable-nafx)),
on the module's built-in ONNX Runtime engine.

The CNN expects a **sliding window** input: every inference receives
the new block of 1024 samples prepended with the 132 samples of past
context its convolutions look back at (the receptive field). In 2.x
the demo assembled that window in a JavaScript pre-processor in the
audio worklet. In v3 the model config **declares** it:
`steerable-nafx.model.json` gives the input a window of 1156 samples
with an `overlap` of 132, the elements kept from the previous window,
so the hop is 1024 and anira's default pre-processing builds the
window from the input ring. No processor, no worklet module: the demo is
the plain chain of [Simple Gain Stereo](simple-gain-stereo.html),
mono.

The contract is Hard, its geometry measured on the running context: 23.2 ms per inference
(1024 samples at 44.1 kHz, the real-time threshold of the 2.x demo)
and 2 warm-up runs. Model windows and overlaps are covered in the
[usage guide](https://anira-project.github.io/anira/usage.html).
