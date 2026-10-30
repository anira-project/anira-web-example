import type { Anira, Context } from '@anira-project/anira'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The page's own inference threads of a context created with `threads: 0` (no pool): each one an
 * `anira_inference_thread` that anira runs as a Wasm Worker on the module's memory, which imports
 * the context's worker module before its loop. A pool's size is fixed at its creation; these
 * threads come and go while the audio plays (the + / − Worker buttons). The classes of the
 * package do not wrap them: the calls are the C entries, typed, on `anira.abi`.
 */
export class InferenceThreads {
  private readonly anira: Anira
  private readonly context: Context
  private readonly threads: number[] = []

  constructor(anira: Anira, context: Context) {
    this.anira = anira
    this.context = context
  }

  /** The threads started and not yet removed. */
  get count(): number {
    return this.threads.length
  }

  /** Start one more thread (`anira_inference_thread_create`, `_start`). */
  add(): void {
    const { abi } = this.anira
    const thread = abi.anira_inference_thread_create(this.context.native())
    try {
      abi.anira_inference_thread_start(thread)
    } catch (error) {
      abi.anira_inference_thread_destroy(thread)
      throw error
    }
    this.threads.push(thread)
  }

  /**
   * Stop the newest thread and destroy it once its Worker left the loop
   * (`anira_inference_thread_stop`, `_has_exited`, `_destroy`). An inference it had taken
   * completes first; the queue's other jobs wait for the remaining threads.
   */
  async remove(): Promise<void> {
    const thread = this.threads.pop()
    if (thread === undefined) return
    const { abi } = this.anira
    abi.anira_inference_thread_stop(thread)
    while (
      abi.anira_inference_thread_is_running(thread) &&
      !abi.anira_inference_thread_has_exited(thread)
    ) {
      await delay(5)
    }
    abi.anira_inference_thread_destroy(thread)
  }

  /**
   * Resolve once every thread is inside its loop (`anira_em_inference_threads_in_loop`): a Wasm
   * Worker starts only after this thread yields and imports the worker module first. An offline
   * render that waits for its inferences awaits this; a live context just misses its first quanta.
   */
  async ready(timeoutMs = 30000): Promise<void> {
    const deadline = performance.now() + timeoutMs
    while (this.anira.abi.anira_em_inference_threads_in_loop() < this.threads.length) {
      if (performance.now() > deadline) {
        throw new Error('the inference threads did not start in time')
      }
      await delay(5)
    }
  }

  /** Stop and destroy every thread (before the context's destroy). */
  async removeAll(): Promise<void> {
    while (this.threads.length > 0) await this.remove()
  }
}
