/**
 * The page's AudioContext at `sampleRate`: with renderSizeHint "hardware" where the browser has
 * render sizes (Web Audio API, Render Quantum Sizes; `renderQuantumSize` is their feature test),
 * so the context renders at the size the browser deems best for the device and a callback is one
 * call. Elsewhere one quantum is 128 frames. measureRenderGeometry reads whichever it got.
 */
export const createAudioContext = (sampleRate: number): AudioContext => {
  const options: AudioContextOptions & { renderSizeHint?: 'hardware' } = { sampleRate }
  if ('renderQuantumSize' in AudioContext.prototype) options.renderSizeHint = 'hardware'
  return new AudioContext(options)
}
