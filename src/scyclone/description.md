# RAVE: Funk & Djembe

Two [RAVE](https://github.com/acids-ircam/RAVE) neural synthesis models — one trained on funk drums, one on djembe — running in parallel inside the browser. A **Fade** slider blends between the two; a **Mix** slider sets the dry/wet balance.

## Signal flow

<figure class="signal-flow"><img src="$SIGNAL_FLOW_SVG" alt="Signal flow diagram" style="width:700px;height:auto;max-width:100%"></figure>

## How the DSP maps to Web Audio

| Block | Implementation |
|---|---|
| RAVE inference (×2) | Two handlers on one context, each a `[1, 1, 16384]` ONNX model (`funk-drums.model.json`, `djembe.model.json`, one `rave.contract.json`) with its own audio node; each config loads one instance of its model (`"max_instances": 1`), and the context's default pool runs the two in parallel when it has two or more threads |
| Stereo → mono downmix | `inputGain` GainNode with `channelCount=1`, `channelInterpretation='speakers'` |
| Fade crossfade | `fadeGain1` / `fadeGain2` with gains summing to 1 |
| Master dry/wet crossfade | `dryGain` / `wetGain` with gains summing to 1, both connected to `destination` |
| Latency compensation | `dryDelay` — a `DelayNode` on the dry path matching model latency, so dry and wet stay time-aligned. The sample count is the handler's `latency()`, which anira derives from the model config and the contract during `prepare()` ([latency model docs](https://anira-project.github.io/anira/latency.html)): it accounts for the alignment between the host's block and the model's 16384-sample window, plus the blocks that pass while the model is inferring (the contract's budget of 341.3 ms). |

## Notes

- **CPU**: two RAVE models at 16384/48 kHz is heavy. Underpowered machines will glitch.
- **Sample rate**: the models are trained at **48 kHz**. The `AudioContext` is pinned to 48000; running at 44.1 kHz produces aliased output.
