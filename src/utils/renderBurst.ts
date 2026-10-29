/** The Web Audio render quantum: the block of every process call of an anira audio node. */
export const QUANTUM = 128

/**
 * The most samples the browser renders back to back, in render quanta: a live context renders
 * a whole device callback (`baseLatency`, 2048 frames on headless Chromium's fake output) as a
 * burst of quanta with no time between them, so an inference submitted inside the burst can
 * only return after it. A Hard contract whose block range reaches the burst
 * (`setGeometry(QUANTUM, renderBurst(audioContext), rate)`) gets the latency that covers it;
 * prepared for 128 / 128 instead, every quantum past the handler's latency in each burst misses
 * (half of them on headless Chromium, the model of simple-gain-stereo). An offline context has
 * no device: one quantum.
 *
 * TODO(anira#213): the anira guides and examples prepare a live context for 128 / 128; drop this
 * once anira sizes the geometry of an audio node's contract itself or documents the burst.
 */
export const renderBurst = (audioContext: BaseAudioContext): number => {
  if (!(audioContext instanceof AudioContext)) return QUANTUM
  const frames = Math.round(audioContext.baseLatency * audioContext.sampleRate)
  return Math.max(QUANTUM, Math.ceil(frames / QUANTUM) * QUANTUM)
}
