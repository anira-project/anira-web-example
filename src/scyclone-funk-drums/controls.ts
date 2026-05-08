export type GraphRefs = {
  audioContext: AudioContext
  inputGain: GainNode
  fadeGain1: GainNode
  fadeGain2: GainNode
  dryGain: GainNode
  wetGain: GainNode
}

type SliderSpec = {
  label: string
  min: number
  max: number
  step: number
  default: number
  unit?: string
  onChange: (value: number) => void
}

export function setupControls(refs: GraphRefs, root: HTMLElement) {
  const { audioContext, inputGain, fadeGain1, fadeGain2, dryGain, wetGain } = refs

  const dbToGain = (db: number) => Math.pow(10, db / 20)

  function setFade(value: number) {
    // 1 → only Funk; 0 → only Djembe.
    const t = audioContext.currentTime
    fadeGain1.gain.setTargetAtTime(value, t, 0.01)
    fadeGain2.gain.setTargetAtTime(1 - value, t, 0.01)
  }

  function setMix(value: number) {
    const t = audioContext.currentTime
    dryGain.gain.setTargetAtTime(1 - value, t, 0.01)
    wetGain.gain.setTargetAtTime(value, t, 0.01)
  }

  setFade(1.0)
  setMix(0.7)

  const sliderSpecs: Record<string, SliderSpec> = {
    inputGainSlider: {
      label: 'Input gain', unit: 'dB', min: -12, max: 12, step: 0.1, default: 0,
      onChange: (v) => inputGain.gain.setTargetAtTime(dbToGain(v), audioContext.currentTime, 0.01),
    },
    fade: {
      label: 'Fade (Funk ↔ Djembe)', min: 0, max: 1, step: 0.01, default: 1,
      onChange: setFade,
    },
    mix: {
      label: 'Mix (Dry ↔ Wet)', min: 0, max: 1, step: 0.01, default: 0.7,
      onChange: setMix,
    },
  }

  function fmt(value: number, step: number, unit?: string) {
    const txt = step >= 1 ? value.toFixed(0) : value.toFixed(2)
    return unit ? `${txt} ${unit}` : txt
  }

  function makeSlider(key: string): HTMLDivElement {
    const spec = sliderSpecs[key]
    const wrap = document.createElement('div')
    wrap.className = 'slider-group'
    const label = document.createElement('label')
    label.className = 'slider-group__label'
    const valueSpan = document.createElement('span')
    valueSpan.className = 'slider-group__value'
    valueSpan.textContent = fmt(spec.default, spec.step, spec.unit)
    label.append(`${spec.label}: `, valueSpan)
    const input = document.createElement('input')
    input.className = 'slider'
    input.type = 'range'
    input.min = String(spec.min)
    input.max = String(spec.max)
    input.step = String(spec.step)
    input.value = String(spec.default)
    input.addEventListener('input', () => {
      const v = parseFloat(input.value)
      valueSpan.textContent = fmt(v, spec.step, spec.unit)
      spec.onChange(v)
    })
    wrap.append(label, input)
    return wrap
  }

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))'
  grid.style.gap = '16px 24px'
  for (const key of Object.keys(sliderSpecs)) {
    grid.append(makeSlider(key))
  }
  root.append(grid)
}
