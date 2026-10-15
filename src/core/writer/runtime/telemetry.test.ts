import { describe, expect, it } from "vitest"
import { RunRecorder } from "./telemetry"

describe("RunRecorder summary usage", () => {
  it("token, biaya & rincian model diambil dari ledger gateway; token event model_call hanya tampilan", () => {
    const recorder = new RunRecorder()
    recorder.recordEvent({ kind: "model_call", status: "ok", durationMs: 5, summary: "x", tokens: { prompt: 999, completion: 999 } })
    recorder.usage.recordSuccess({
      model: "acme/primary",
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      reasoningTokens: 0,
      cachedPromptTokens: 0,
      costUsd: 0.003,
    })
    recorder.usage.recordFailure("acme/primary")

    const summary = recorder.getSummary("completed", "completed", 900)
    expect(summary).toMatchObject({
      modelCalls: 1,
      tokensPrompt: 100,
      tokensCompletion: 20,
      tokensTotal: 120,
      llmCalls: 1,
      llmFailedCalls: 1,
      costUsd: 0.003,
      modelUsage: [{ model: "acme/primary", calls: 1, failedCalls: 1, costUsd: 0.003 }],
    })
  })

  it("tanpa panggilan LLM → nol token dan biaya null", () => {
    expect(new RunRecorder().getSummary("failed")).toMatchObject({ tokensTotal: 0, llmCalls: 0, costUsd: null, modelUsage: [] })
  })
})

describe("RunRecorder resume checkpoint", () => {
  it("markResumed mencatat langkah unik + event checkpoint_resume; ringkasan memuat resumedSteps", () => {
    const events: string[] = []
    const recorder = new RunRecorder((event) => events.push(`${event.tool}:${event.status}`))

    recorder.markResumed(["pre_resolve"], "pakai ulang pre_resolve")
    recorder.markResumed(["pre_resolve", "draft"], "pakai ulang draft")

    expect(recorder.getSummary("completed")).toMatchObject({ resumedSteps: ["pre_resolve", "draft"], tokensTotal: 0 })
    expect(events).toEqual(["checkpoint_resume:ok", "checkpoint_resume:ok"])
  })
})
