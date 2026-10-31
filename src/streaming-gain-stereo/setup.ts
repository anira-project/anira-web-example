import {
  Anira,
  Context,
  ContractHandle,
  InferenceHandler,
  ModelConfig,
  Pipeline,
  anira_engine,
  measureRenderGeometry,
} from '@anira-project/anira'
/**
 * The demo's anira chain: a stereo gain model whose gain is a second Streamed input, a value per
 * sample, on the built-in ONNX Runtime engine.
 * Loading needs no audio; `start` builds the chain on a running context (a live one is
 * measured) up to the handler's audio node, which the page connects. `waitMs` lets each quantum
 * wait for its inference (an offline render).
 */
export async function loadStreamingGainStereo() {
  // The module on this thread. Its shared WebAssembly memory starts at 256 MiB and grows as the
  // models need (Anira.create's `memory` option sizes it).
  const anira = await Anira.create()
  // Its log, to the console. The web has no log drain thread: the pump delivers the records the
  // real-time threads queue.
  anira.setLogSink()
  const stopLogPump = anira.startLogPump()

  // The context: the core and its pool of inference threads, Wasm Workers, half the cores by
  // default, as natively. The built-in engine needs no worker module.
  const context = Context.create(anira)

  // The model config: two Streamed inputs (audio, 2 channels; gain, 1 channel) and their two
  // outputs, windows of 512. The contract's miss policy is zeros: a bypass needs every output to
  // have the anchored input's channels, and gain_out has one.
  const site = new URL(import.meta.env.BASE_URL, location.href)
  const model = await ModelConfig.fromUrl(
    anira,
    new URL('streaming-gain-stereo.model.json', site)
  )
  const contract = await ContractHandle.fromUrl(
    anira,
    new URL('streaming-gain-stereo.contract.json', site)
  )

  const start = async (audioContext: BaseAudioContext, { waitMs = 0 } = {}) => {
    // The geometry: one render quantum per process call, and blocks up to the burst a live
    // context renders back to back (a device callback's worth of quanta), measured on the
    // running context. The contract gets it, so the latency the handler reports covers a burst.
    const geometry = await measureRenderGeometry(audioContext)
    contract.hardGeometry(geometry.quantum, geometry.burst, audioContext.sampleRate)

    // The pipeline: the one inference stage over the model config.
    const pipeline = Pipeline.create(anira).addInference(model)
    const handler = InferenceHandler.create(context, pipeline)
    pipeline.destroy() // the handler copied it

    // prepare compiles the plans under the contract and returns the report of them: one plan per
    // model entry the build can run, with its engine (a JavaScript engine by its id, a built-in
    // one by its anira_engine name) and its budget.
    const report = handler.prepare(contract)
    for (const plan of report.plans()) {
      const engine =
        plan.engineId ??
        Object.entries(anira_engine).find(([, value]) => value === plan.engine)?.[0]
      console.log(`plan: ${engine}, ${plan.budgetMs} ms budget`)
    }
    // The latency: how many samples later the output answers the input.
    console.log(`latency: ${handler.getLatency()} samples`)

    // The pool's Workers start once this thread yields and import their module first: an
    // offline render waits for every inference, so they must be in their loops before it; a
    // live stream would only miss its first quanta.
    await context.ready()
    console.log(`inference threads: ${context.numInferenceThreads()}`)

    // The audio node serves every Streamed slot, one Web Audio input and output per slot with the
    // slot's channels: input 0 the stereo audio, input 1 the gain stream; output 0 the processed
    // audio, output 1 the model's copy of the gain. It hands them to the handler together each
    // quantum.
    const audioNode = await handler.createAudioNode(audioContext, { waitMs })

    // After an output-device change (the page's sinkchange): measure again with the running node
    // held (silent, so its rendering does not hide the device's callbacks from the probe), give
    // the contract the new geometry and re-prepare the node, which holds off (silence) while its
    // handler re-prepares.
    const remeasure = async () => {
      const g = await measureRenderGeometry(audioContext, { hold: [audioNode] })
      contract.hardGeometry(g.quantum, g.burst, audioContext.sampleRate)
      const again = audioNode.prepare(contract) // the report of the new prepare
      console.log(
        `re-prepared: ${again.numPlans()} plan(s), latency ${handler.getLatency()} samples`
      )
    }

    // The teardown, in reverse order of creation: the node stops calling the handler first. C
    // objects are freed by destroy, never by the garbage collector.
    const teardown = () => {
      audioNode.node.disconnect()
      audioNode.destroy()
      handler.destroy()
      contract.destroy()
      model.destroy()
      context.destroy() // the last context stops the pool
      stopLogPump()
    }
    return {
      audioNode,
      getLatency: () => handler.getLatency(),
      remeasure,
      teardown,
    }
  }
  return { anira, context, start }
}
