import type { InferenceThreads } from './inferenceThreads'

/** What a page's `start` hands back: how its dry path and the latency badge follow the chain. */
export type StartedDemo = {
  /** The latency the dry path waits for, in samples: the handler's, read after its prepare. */
  getLatency: () => number
  /** Measure the context's render geometry again and re-prepare the running node(s). */
  remeasure: () => Promise<void>
  /** The dry path's delay, set to `getLatency() / sampleRate`. */
  dry: DelayNode
}

export type DemoUIOptions = {
  audio: HTMLAudioElement
  audioContext: AudioContext
  /**
   * Build the anira chain on the running context and connect it: the first Play calls it after
   * `audioContext.resume()`, since the context's render geometry is measured on a running
   * context.
   */
  start: () => Promise<StartedDemo>
  /** A page that starts its own inference threads: the + / − Worker controls drive them. */
  threads?: InferenceThreads
}

/**
 * Wires up the demo UI controls that already exist in the HTML.
 * Enables buttons and attaches event handlers for audio playback, the latency badge and, for a
 * page that starts its own inference threads (`threads`), the + / − Worker controls (each thread
 * a Wasm Worker: + Worker starts one, − Worker stops the newest).
 */
export const setupDemoUI = ({ audio, audioContext, start, threads }: DemoUIOptions) => {
  const audioToggleButton = document.getElementById('audio-toggle') as HTMLButtonElement
  audioToggleButton.disabled = false

  // The latency badge: the handler's latency once the chain runs; data-dry-delay is the dry
  // path's delay in seconds as set (read by the headless test).
  const latencyBadge = document.createElement('div')
  latencyBadge.id = 'latency-badge'
  latencyBadge.className = 'worker-badge'
  latencyBadge.textContent = 'Latency: –'
  audioToggleButton.parentElement?.appendChild(latencyBadge)

  let started: StartedDemo | null = null
  const applyLatency = (demo: StartedDemo) => {
    const samples = demo.getLatency()
    demo.dry.delayTime.value = samples / audioContext.sampleRate
    const ms = (1000 * samples) / audioContext.sampleRate
    latencyBadge.textContent = `Latency: ${samples} samples (${ms.toFixed(1)} ms)`
    latencyBadge.dataset.dryDelay = String(demo.dry.delayTime.value)
  }

  // The first Play builds the chain: resume, then `start` (measure, prepare, the node).
  const ensureStarted = async () => {
    if (audioContext.state !== 'running') await audioContext.resume()
    if (started) return
    audioToggleButton.disabled = true
    audioToggleButton.textContent = 'Starting…'
    try {
      started = await start()
      applyLatency(started)
      const demo = started
      // The page switches the output device, so the page decides when to re-measure: the burst
      // may differ on the new device, the running node is re-prepared for it, and the dry path
      // and the badge take the new latency. An OS default-device change may fire no event.
      audioContext.addEventListener('sinkchange', async () => {
        await demo.remeasure()
        applyLatency(demo)
      })
    } finally {
      audioToggleButton.disabled = false
    }
  }

  audio.loop = true

  const syncToggleLabel = () => {
    audioToggleButton.textContent = audio.paused ? 'Play' : 'Pause'
  }
  audio.addEventListener('play', syncToggleLabel)
  audio.addEventListener('pause', syncToggleLabel)
  audio.addEventListener('ended', syncToggleLabel)
  syncToggleLabel()

  audioToggleButton.onclick = async () => {
    if (audio.paused) {
      try {
        await ensureStarted()
        await audio.play()
      } catch (error) {
        console.error('Failed to start audio playback:', error)
        syncToggleLabel()
      }
    } else {
      audio.pause()
    }
  }

  // Inject a "Load audio" file picker next to the audio toggle so users
  // can swap in their own audio. Replacing audio.src is transparent to
  // the MediaElementSource that the demo wires up downstream.
  const fileLabel = document.createElement('label')
  fileLabel.className = 'btn'
  fileLabel.textContent = 'Load audio'
  fileLabel.title = 'Load your own audio file'
  fileLabel.style.cursor = 'pointer'

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'audio/*'
  fileInput.style.display = 'none'
  fileLabel.appendChild(fileInput)

  let currentObjectUrl: string | null = null
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const wasPlaying = !audio.paused
    audio.pause()
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = URL.createObjectURL(file)
    audio.src = currentObjectUrl
    audio.load()
    fileLabel.textContent = file.name
    fileLabel.appendChild(fileInput)
    if (wasPlaying) {
      try {
        await ensureStarted()
        await audio.play()
      } catch (error) {
        console.error('Failed to resume after loading file:', error)
      }
    }
  }

  audioToggleButton.parentElement?.insertBefore(fileLabel, latencyBadge)

  if (threads) setupWorkerControls(threads)

  return {
    removeLoadingIndicator: () => document.getElementById('loading-indicator')?.remove(),
  }
}

/**
 * Connects source → inference → destination with a parallel dry path so the Dry / Wet button can
 * flip between the processed (wet) and the bypassed (dry) signal. Both paths run at once; only
 * the gains are swapped. The dry path goes through a DelayNode, which the page sets to the
 * handler's latency (setupDemoUI does, from `StartedDemo.dry`), so the two line up and the
 * A/B compares the same moment of the input.
 */
export const connectDryWet = (
  audioContext: AudioContext,
  sourceNode: AudioNode,
  inferenceNode: AudioNode
): DelayNode => {
  const dryWetToggleButton = document.getElementById(
    'dry-wet-toggle'
  ) as HTMLButtonElement | null

  const dry = new DelayNode(audioContext, { maxDelayTime: 2 })
  const dryGain = audioContext.createGain()
  const wetGain = audioContext.createGain()
  dryGain.gain.value = 0
  wetGain.gain.value = 1

  sourceNode.connect(dry).connect(dryGain).connect(audioContext.destination)
  sourceNode.connect(inferenceNode).connect(wetGain).connect(audioContext.destination)

  if (dryWetToggleButton) {
    let isWet = true
    const renderToggle = () => {
      dryWetToggleButton.textContent = isWet ? 'Wet' : 'Dry'
      dryWetToggleButton.classList.toggle('btn--primary', isWet)
    }
    dryWetToggleButton.disabled = false
    dryWetToggleButton.onclick = () => {
      isWet = !isWet
      dryGain.gain.value = isWet ? 0 : 1
      wetGain.gain.value = isWet ? 1 : 0
      renderToggle()
    }
    renderToggle()
  }
  return dry
}

/** The + / − Worker controls of a page that starts and stops its own inference threads. */
const setupWorkerControls = (threads: InferenceThreads) => {
  const workerCountElement = document.getElementById('worker-count')!
  const addWorkerButton = document.getElementById('add-worker') as HTMLButtonElement
  const removeWorkerButton = document.getElementById('remove-worker') as HTMLButtonElement

  addWorkerButton.disabled = false

  const updateWorkerCount = () => {
    workerCountElement.textContent = threads.count.toString()
    removeWorkerButton.disabled = threads.count === 0
  }

  addWorkerButton.onclick = () => {
    try {
      threads.add()
      updateWorkerCount()
      console.log('Added inference worker. Total:', threads.count)
    } catch (error) {
      console.error('Failed to add worker:', error)
    }
  }

  removeWorkerButton.onclick = async () => {
    if (threads.count === 0) {
      console.warn('No workers to remove')
      return
    }
    removeWorkerButton.disabled = true
    await threads.remove()
    updateWorkerCount()
    console.log('Removed inference worker. Remaining:', threads.count)
  }

  updateWorkerCount()
}
