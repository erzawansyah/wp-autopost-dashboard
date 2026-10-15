import { BaseCallbackHandler } from "@langchain/core/callbacks/base"
import type { LLMResult } from "@langchain/core/outputs"

/**
 * Akuntansi token & biaya seluruh panggilan LLM dalam satu run/request gateway (agent loop,
 * subagent Deep Agent, pre-resolve, finalize, WP Tools). Biaya diambil dari `usage.cost` OpenRouter
 * (request dikirim dengan `usage: { include: true }`); token dari `usage_metadata` LangChain.
 */

export interface LlmUsageTotals {
  /** Panggilan LLM yang selesai dengan respons. */
  calls: number
  /** Panggilan yang tetap gagal setelah retry (termasuk percobaan sebelum fallback model). */
  failedCalls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** Bagian completionTokens untuk penalaran (bila provider melaporkan). */
  reasoningTokens: number
  /** Bagian promptTokens yang dibaca dari cache provider (bila dilaporkan). */
  cachedPromptTokens: number
  /** Biaya USD menurut OpenRouter; `null` bila tidak satu pun panggilan melaporkan biaya. */
  costUsd: number | null
}

export interface LlmModelUsage extends LlmUsageTotals {
  /** ID model OpenRouter yang dikonfigurasi gateway (model utama atau cadangan). */
  model: string
}

export interface LlmUsageSnapshot extends LlmUsageTotals {
  /** Rincian per model, urut sesuai pemakaian pertama. */
  byModel: LlmModelUsage[]
}

/** Pemakaian satu panggilan LLM yang sukses. */
export interface LlmCallUsage {
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedPromptTokens: number
  costUsd?: number
}

function emptyTotals(): LlmUsageTotals {
  return {
    calls: 0,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    costUsd: null,
  }
}

/** Pembulatan 1e-9 USD agar penjumlahan float tidak menghasilkan ekor 0.30000000000000004. */
function roundUsd(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

function addTotals(target: LlmUsageTotals, source: LlmUsageTotals): void {
  target.calls += source.calls
  target.failedCalls += source.failedCalls
  target.promptTokens += source.promptTokens
  target.completionTokens += source.completionTokens
  target.totalTokens += source.totalTokens
  target.reasoningTokens += source.reasoningTokens
  target.cachedPromptTokens += source.cachedPromptTokens
  if (source.costUsd !== null) target.costUsd = roundUsd((target.costUsd ?? 0) + source.costUsd)
}

export class LlmUsageLedger {
  private readonly byModel = new Map<string, LlmUsageTotals>()

  private entry(model: string): LlmUsageTotals {
    let totals = this.byModel.get(model)
    if (!totals) {
      totals = emptyTotals()
      this.byModel.set(model, totals)
    }
    return totals
  }

  recordSuccess(usage: LlmCallUsage): void {
    addTotals(this.entry(usage.model), {
      calls: 1,
      failedCalls: 0,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      reasoningTokens: usage.reasoningTokens,
      cachedPromptTokens: usage.cachedPromptTokens,
      costUsd: usage.costUsd ?? null,
    })
  }

  recordFailure(model: string): void {
    this.entry(model).failedCalls += 1
  }

  snapshot(): LlmUsageSnapshot {
    const total = emptyTotals()
    const byModel: LlmModelUsage[] = []
    for (const [model, totals] of this.byModel) {
      addTotals(total, totals)
      byModel.push({ model, ...totals })
    }
    return { ...total, byModel }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined
}

function asCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * Ekstrak pemakaian dari hasil `handleLLMEnd`. `usage_metadata` pesan menjadi sumber token utama;
 * objek usage mentah OpenRouter (`llmOutput.tokenUsage`, disalin core ke `response_metadata.tokenUsage`)
 * menjadi cadangan token sekaligus satu-satunya sumber `cost`.
 */
export function extractLlmCallUsage(output: LLMResult, model: string): LlmCallUsage {
  const generation = asRecord(output.generations?.[0]?.[0])
  const message = asRecord(generation?.message)
  const usageMetadata = asRecord(message?.usage_metadata)
  const raw = asRecord(output.llmOutput?.tokenUsage) ?? asRecord(asRecord(message?.response_metadata)?.tokenUsage)

  const promptTokens = asCount(usageMetadata?.input_tokens) ?? asCount(raw?.prompt_tokens) ?? asCount(raw?.promptTokens) ?? 0
  const completionTokens =
    asCount(usageMetadata?.output_tokens) ?? asCount(raw?.completion_tokens) ?? asCount(raw?.completionTokens) ?? 0
  const totalTokens =
    asCount(usageMetadata?.total_tokens) ?? asCount(raw?.total_tokens) ?? asCount(raw?.totalTokens) ?? promptTokens + completionTokens
  const reasoningTokens =
    asCount(asRecord(usageMetadata?.output_token_details)?.reasoning) ??
    asCount(asRecord(raw?.completion_tokens_details)?.reasoning_tokens) ??
    0
  const cachedPromptTokens =
    asCount(asRecord(usageMetadata?.input_token_details)?.cache_read) ??
    asCount(asRecord(raw?.prompt_tokens_details)?.cached_tokens) ??
    0

  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens,
    cachedPromptTokens,
    costUsd: asCount(raw?.cost),
  }
}

/**
 * Callback per instans model gateway: setiap panggilan (sukses/gagal) dicatat ke ledger run.
 * Di-await inline (`_awaitHandler`) agar ringkasan run tidak tertinggal callback yang masih antre.
 */
export class LlmUsageCallbackHandler extends BaseCallbackHandler {
  name = "panitera_llm_usage"
  readonly ledger: LlmUsageLedger
  readonly model: string

  /** `copy()` bawaan memanggil `new constructor(this)`: bentuk input sengaja sama dengan properti instans. */
  constructor(input: { ledger: LlmUsageLedger; model: string }) {
    super({ _awaitHandler: true })
    this.ledger = input.ledger
    this.model = input.model
  }

  handleLLMEnd(output: LLMResult): void {
    this.ledger.recordSuccess(extractLlmCallUsage(output, this.model))
  }

  handleLLMError(): void {
    this.ledger.recordFailure(this.model)
  }
}
