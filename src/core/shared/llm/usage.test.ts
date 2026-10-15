import { describe, expect, it } from "vitest"
import { AIMessage } from "@langchain/core/messages"
import type { ChatGeneration, LLMResult } from "@langchain/core/outputs"
import { extractLlmCallUsage, LlmUsageCallbackHandler, LlmUsageLedger } from "./usage"

function chatResult(message: AIMessage, llmOutput?: Record<string, unknown>): LLMResult {
  const generation: ChatGeneration = { text: String(message.content), message }
  return { generations: [[generation]], llmOutput }
}

describe("extractLlmCallUsage", () => {
  it("token dari usage_metadata, biaya dari usage mentah OpenRouter", () => {
    const message = new AIMessage({
      content: "ok",
      usage_metadata: {
        input_tokens: 120,
        output_tokens: 30,
        total_tokens: 150,
        input_token_details: { cache_read: 20 },
        output_token_details: { reasoning: 10 },
      },
    })
    const usage = extractLlmCallUsage(
      chatResult(message, { tokenUsage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, cost: 0.0042 } }),
      "openai/gpt-4o-mini"
    )
    expect(usage).toEqual({
      model: "openai/gpt-4o-mini",
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      reasoningTokens: 10,
      cachedPromptTokens: 20,
      costUsd: 0.0042,
    })
  })

  it("tanpa usage_metadata memakai usage mentah (`response_metadata.tokenUsage`)", () => {
    const message = new AIMessage({
      content: "ok",
      response_metadata: {
        tokenUsage: {
          prompt_tokens: 50,
          completion_tokens: 5,
          completion_tokens_details: { reasoning_tokens: 2 },
          prompt_tokens_details: { cached_tokens: 7 },
          cost: 0.001,
        },
      },
    })
    expect(extractLlmCallUsage(chatResult(message), "m/x")).toMatchObject({
      promptTokens: 50,
      completionTokens: 5,
      totalTokens: 55,
      reasoningTokens: 2,
      cachedPromptTokens: 7,
      costUsd: 0.001,
    })
  })

  it("tanpa data usage sama sekali → nol tanpa biaya", () => {
    expect(extractLlmCallUsage({ generations: [[{ text: "x" }]] }, "m/x")).toEqual({
      model: "m/x",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedPromptTokens: 0,
      costUsd: undefined,
    })
  })
})

describe("LlmUsageLedger", () => {
  const call = (model: string, prompt: number, completion: number, costUsd?: number) => ({
    model,
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    costUsd,
  })

  it("agregasi lintas panggilan & model, rincian per model urut pemakaian pertama", () => {
    const ledger = new LlmUsageLedger()
    ledger.recordSuccess(call("a/primary", 100, 10, 0.1))
    ledger.recordFailure("a/primary")
    ledger.recordSuccess(call("b/fallback", 50, 5, 0.2))
    ledger.recordSuccess(call("a/primary", 1, 1))

    const snapshot = ledger.snapshot()
    expect(snapshot).toMatchObject({
      calls: 3,
      failedCalls: 1,
      promptTokens: 151,
      completionTokens: 16,
      totalTokens: 167,
      costUsd: 0.3,
    })
    expect(snapshot.byModel.map((m) => [m.model, m.calls, m.failedCalls, m.costUsd])).toEqual([
      ["a/primary", 2, 1, 0.1],
      ["b/fallback", 1, 0, 0.2],
    ])
  })

  it("biaya null bila tidak satu pun panggilan melaporkan biaya", () => {
    const ledger = new LlmUsageLedger()
    ledger.recordSuccess(call("a/x", 1, 1))
    expect(ledger.snapshot().costUsd).toBeNull()
    expect(new LlmUsageLedger().snapshot()).toMatchObject({ calls: 0, costUsd: null, byModel: [] })
  })
})

describe("LlmUsageCallbackHandler", () => {
  it("mencatat sukses & gagal ke ledger atas nama model instans; copy() tetap berbagi ledger", async () => {
    const ledger = new LlmUsageLedger()
    const handler = new LlmUsageCallbackHandler({ ledger, model: "a/x" })
    expect(handler.awaitHandlers).toBe(true)

    handler.handleLLMEnd(chatResult(new AIMessage({ content: "ok", usage_metadata: { input_tokens: 3, output_tokens: 4, total_tokens: 7 } })))
    const copied = handler.copy() as LlmUsageCallbackHandler
    copied.handleLLMError()

    expect(copied.ledger).toBe(ledger)
    expect(ledger.snapshot()).toMatchObject({ calls: 1, failedCalls: 1, totalTokens: 7 })
  })
})
