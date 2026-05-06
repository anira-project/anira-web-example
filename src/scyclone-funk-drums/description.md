# Scyclone (funk_drums)

Real-time **timbre transfer** through one of the RAVE-based models from
[Scyclone](https://github.com/Torsion-Audio/Scyclone) — a neural audio
plugin that re-synthesizes incoming audio in the timbre of a corpus the
model was trained on. The `funk_drums` model maps any input signal into
the sonic character of funk drum recordings.

> **Note:** Scyclone's models are trained at **48 kHz**. Running the
> `AudioContext` at 44.1 kHz produces aliased, screeching output — make
> sure both the `AudioContext` and `HostConfig` sample rate are 48000.
