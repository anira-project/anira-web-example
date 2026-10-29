import type { InferenceThreads } from './inferenceThreads'

/**
 * Wires up the demo UI controls that already exist in the HTML.
 * Enables buttons and attaches event handlers for audio playback and the inference threads
 * (each a Wasm Worker: + Worker starts one, − Worker stops the newest).
 */
export const setupDemoUI = (
  threads: InferenceThreads,
  audio?: HTMLAudioElement,
  audioContext?: AudioContext
) => {
  const audioToggleButton = document.getElementById('audio-toggle') as HTMLButtonElement
  audioToggleButton.disabled = false

  const workerCountElement = document.getElementById('worker-count')!
  const addWorkerButton = document.getElementById('add-worker') as HTMLButtonElement
  const removeWorkerButton = document.getElementById('remove-worker') as HTMLButtonElement
  const dryWetToggleButton = document.getElementById(
    'dry-wet-toggle'
  ) as HTMLButtonElement | null

  addWorkerButton.disabled = false

  const updateWorkerCount = () => {
    workerCountElement.textContent = threads.count.toString()
    removeWorkerButton.disabled = threads.count === 0
  }

  if (audio) {
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
          if (audioContext && audioContext.state !== 'running') {
            await audioContext.resume()
          }
          await audio.play()
        } catch (error) {
          console.error('Failed to start audio playback:', error)
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
          if (audioContext && audioContext.state !== 'running') {
            await audioContext.resume()
          }
          await audio.play()
        } catch (error) {
          console.error('Failed to resume after loading file:', error)
        }
      }
    }

    audioToggleButton.parentElement?.appendChild(fileLabel)
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

  /**
   * Connects source → inference → destination with a parallel dry path so a
   * toggle button can flip between the processed (wet) and bypassed (dry)
   * signal. Both paths run simultaneously; only the gains are swapped.
   */
  const connectAudioGraph = (sourceNode: AudioNode, inferenceNode: AudioNode) => {
    if (!audioContext) {
      throw new Error('connectAudioGraph requires an AudioContext')
    }

    const dryGain = audioContext.createGain()
    const wetGain = audioContext.createGain()
    dryGain.gain.value = 0
    wetGain.gain.value = 1

    sourceNode.connect(dryGain).connect(audioContext.destination)
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
  }

  return {
    removeLoadingIndicator: () => document.getElementById('loading-indicator')?.remove(),
    connectAudioGraph,
  }
}
