import "server-only"
import type { QueueDbClient } from "@/core/queue/batch-progress"
import type { FailureClass } from "@/core/queue/retry-policy"
import { classifyLlmError, describeLlmError } from "@/core/shared/llm/errors"
import { createLlmGateway } from "@/core/shared/llm/gateway"
import type { LlmUsageLedger } from "@/core/shared/llm/usage"
import { loadSectionedPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { toUntrustedPromptJson } from "@/core/shared/prompts/untrusted-data"
import { getKeywordSuggestions } from "@/core/shared/tools/keyword-suggestions"
import { MISSING_OPENROUTER_KEY_MESSAGE } from "@/lib/ai/platform-keys"
import { getLanguageDisplayName } from "@/lib/constants/languages"
import { BATCH_KEYWORD_MAX, MAX_BATCH_ITEMS, NICHE_KEYWORD_SOURCE, NICHE_TEXT_MAX } from "@/lib/validation/batches"
import { fetchWordPressPostTitles } from "@/lib/wordpress/client"
import { stripToPlainText } from "@/lib/wordpress/plain-text"
import type { DecryptedUserKeys } from "@/types/settings"

/**
 * Rencana kata kunci batch Tulis Niche (`content_batches.source_type = 'niche_auto'`).
 *
 * Batch dibuat dengan N item ber-`target_keyword` kosong. Klaim pertama yang menemukan kata kunci kosong
 * menyusun SELURUH rencana sekali jalan: judul artikel di WordPress + kata kunci antrean situs yang sama
 * (agar topik tidak dobel) dan saran autocomplete niche (permintaan pencarian nyata) dikirim ke LLM
 * (`system-niche-keyword-plan.md`), lalu hasilnya disaring dan disimpan lewat RPC `assign_niche_keywords`
 * yang dipagari token klaim (penulis pertama menang; item lain batch ikut terisi). Klaim berikutnya cukup
 * membaca rencana tersimpan, jadi "Tulis ulang" dan retry tidak pernah menyusun ulang.
 */

/** Kata kunci cadangan per permintaan LLM untuk menutup hasil yang tersaring (duplikat/topik sudah ada). */
const KEYWORD_BUFFER = 5
/** Permintaan LLM maksimum per rencana (putaran kedua hanya meminta kekurangan). */
const MAX_PLAN_ROUNDS = 2
/** Batas data situs yang dikirim ke LLM. */
const SITE_TITLE_LIMIT = 100
const PLANNED_KEYWORD_LIMIT = 200
const PROMPT_TITLE_MAX = 200
const SEARCH_SUGGESTION_LIMIT = 15
const RATIONALE_MAX = 500
/** Kunci normalisasi terpendek yang dianggap kata kunci bermakna. */
const MIN_KEYWORD_KEY_LENGTH = 3

/** Kegagalan penyusunan rencana dengan klasifikasi retry antrean (`retry-policy.ts`). */
export class NicheKeywordError extends Error {
  readonly failure: FailureClass

  constructor(message: string, failure: FailureClass) {
    super(message)
    this.name = "NicheKeywordError"
    this.failure = failure
  }
}

/** Item Tulis Niche yang kata kuncinya belum diisi rencana batch. */
export function isPendingNicheKeyword(targetKeyword: unknown, payload: Record<string, unknown>): boolean {
  return payload.keyword_source === NICHE_KEYWORD_SOURCE && (typeof targetKeyword !== "string" || targetKeyword.trim() === "")
}

/** Kunci pembanding topik: huruf kecil, tanda baca & spasi berlebih dibuang. */
export function normalizeKeywordKey(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

const LIST_MARKER_RE = /^(?:\d{1,3}[.)]|[-*•])\s+/
const WRAPPING_QUOTES_RE = /^["'“”‘’«»]+|["'“”‘’«»]+$/g
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/

/**
 * Keluaran LLM (tidak tepercaya) → kata kunci teks polos (≤ `BATCH_KEYWORD_MAX`), tanpa penomoran/kutip/tanda baca
 * penutup, unik, dan tidak sama dengan topik di `covered` (judul situs, antrean, pilihan sebelumnya). Maks. `limit`.
 */
export function selectNicheKeywords(raw: unknown, covered: ReadonlySet<string>, limit: number): string[] {
  if (!Array.isArray(raw) || limit <= 0) return []
  const seen = new Set(covered)
  const selected: string[] = []
  for (const value of raw) {
    const keyword = stripToPlainText(value, BATCH_KEYWORD_MAX)
      .replace(LIST_MARKER_RE, "")
      .replace(WRAPPING_QUOTES_RE, "")
      .replace(TRAILING_PUNCTUATION_RE, "")
      .trim()
    const key = normalizeKeywordKey(keyword)
    if (key.length < MIN_KEYWORD_KEY_LENGTH || seen.has(key)) continue
    seen.add(key)
    selected.push(keyword)
    if (selected.length >= limit) break
  }
  return selected
}

function toSlotIndex(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_BATCH_ITEMS ? value : undefined
}

/** Rencana tersimpan (`ai_config.niche_keywords` / hasil RPC) → daftar teks, atau `null` bila belum ada/rusak. */
function toKeywordPlan(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value.every((item) => typeof item === "string" && item.trim().length > 0) ? (value as string[]) : null
}

function uniquePlainTexts(values: readonly unknown[], maxLength: number, limit: number): string[] {
  const seen = new Set<string>()
  const texts: string[] = []
  for (const value of values) {
    const text = stripToPlainText(value, maxLength)
    const key = normalizeKeywordKey(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    texts.push(text)
    if (texts.length >= limit) break
  }
  return texts
}

export interface NicheKeywordRequest {
  claim: { id: string; userId: string; batchId: string | null; leaseToken: string }
  /** `source_payload.slot_index` item (urutan artikel di batch). */
  slotIndex: unknown
  site: { id: string; siteName: string; baseUrl: string; username: string; applicationPassword: string }
  /** Kode bahasa artikel batch. */
  language: string
  /** Model penulisan item (hasil `resolveWriterModel`). */
  model: string
  userKeys: DecryptedUserKeys
  /** Ledger run: token & biaya penyusunan ikut tercatat di `agent_runs` item ini. */
  usage: LlmUsageLedger
  signal: AbortSignal
}

/** Ringkasan penyusunan rencana untuk log aktivitas item yang menyusunnya. */
export interface NicheKeywordPlanReport {
  niche: string
  keywords: string[]
  rationale: string
  /** true bila klaim lain menyimpan rencana lebih dulu (rencana klaim ini dibuang). */
  adoptedExisting: boolean
  sources: { existingTitles: number; plannedKeywords: number; searchSuggestions: number }
  llmCalls: number
}

export type NicheKeywordResult =
  | { status: "ready"; keyword: string; slot: number; total: number; plan: NicheKeywordPlanReport | null }
  | { status: "claim_lost" }

interface NicheBatchRow {
  total_items: number
  custom_instructions_override: string | null
  ai_config: Record<string, unknown> | null
}

/**
 * Kata kunci item Tulis Niche: dari rencana batch yang sudah tersimpan, atau menyusun rencana baru (lihat header).
 * `claim_lost` = item tidak lagi dipegang klaim ini (rencana tidak disimpan). Kegagalan dilempar sebagai
 * `NicheKeywordError`; pembatalan klaim (`signal`) dilempar apa adanya.
 */
export async function resolveNicheKeyword(supabase: QueueDbClient, request: NicheKeywordRequest): Promise<NicheKeywordResult> {
  const { claim } = request
  const slot = toSlotIndex(request.slotIndex)
  if (!claim.batchId || slot === undefined) {
    throw new NicheKeywordError("Artikel Tulis Niche tidak memiliki batch atau nomor urut yang valid.", "permanent")
  }

  const { data, error } = await supabase
    .from("content_batches")
    .select("total_items, custom_instructions_override, ai_config")
    .eq("id", claim.batchId)
    .eq("user_id", claim.userId)
    .eq("source_type", NICHE_KEYWORD_SOURCE)
    .maybeSingle()
  if (error) throw new NicheKeywordError(`Batch Tulis Niche gagal dibaca: ${error.message}`, "transient")
  if (!data) throw new NicheKeywordError("Batch Tulis Niche untuk artikel ini tidak ditemukan.", "permanent")
  const batch = data as NicheBatchRow
  const config = batch.ai_config ?? {}

  const pick = (plan: string[], report: NicheKeywordPlanReport | null): NicheKeywordResult => {
    const keyword = plan[slot]?.trim()
    if (!keyword) {
      throw new NicheKeywordError(`Rencana kata kunci batch tidak memuat artikel #${slot + 1}.`, "permanent")
    }
    return { status: "ready", keyword, slot, total: plan.length, plan: report }
  }

  const stored = toKeywordPlan(config.niche_keywords)
  if (stored) return pick(stored, null)

  const niche = stripToPlainText(config.niche, NICHE_TEXT_MAX)
  if (!niche) throw new NicheKeywordError("Niche batch kosong; buat ulang batch Tulis Niche.", "permanent")
  const configuredCount = config.niche_article_count
  const count = Math.min(
    typeof configuredCount === "number" && Number.isInteger(configuredCount) && configuredCount > 0 ? configuredCount : batch.total_items,
    MAX_BATCH_ITEMS
  )
  if (slot >= count) {
    throw new NicheKeywordError(`Artikel #${slot + 1} di luar jumlah artikel batch (${count}).`, "permanent")
  }

  const context = await collectPlanContext(supabase, request, niche)
  const draft = await draftKeywordPlan(request, {
    niche,
    count,
    brief: stripToPlainText(batch.custom_instructions_override ?? "", 2_000),
    ...context,
  })

  const { data: saved, error: saveError } = await supabase.rpc("assign_niche_keywords", {
    p_post_item_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_keywords: draft.keywords,
  })
  if (saveError) throw new NicheKeywordError(`Rencana kata kunci gagal disimpan: ${saveError.message}`, "transient")
  if (saved === null) return { status: "claim_lost" }
  const plan = toKeywordPlan(saved)
  if (!plan) throw new NicheKeywordError("Rencana kata kunci tersimpan tidak valid.", "transient")

  return pick(plan, {
    niche,
    keywords: plan,
    rationale: draft.rationale,
    adoptedExisting: plan.join("\n") !== draft.keywords.join("\n"),
    sources: {
      existingTitles: context.existingTitles.length,
      plannedKeywords: context.plannedKeywords.length,
      searchSuggestions: context.searchSuggestions.length,
    },
    llmCalls: draft.llmCalls,
  })
}

interface PlanContext {
  existingTitles: string[]
  plannedKeywords: string[]
  searchSuggestions: string[]
}

/** Data pendukung (best-effort; sumber yang gagal dilewati): judul WordPress, antrean situs, autocomplete niche. */
async function collectPlanContext(supabase: QueueDbClient, request: NicheKeywordRequest, niche: string): Promise<PlanContext> {
  const { site, claim, signal } = request
  const [titles, queued, suggestions] = await Promise.all([
    fetchWordPressPostTitles({
      baseUrl: site.baseUrl,
      username: site.username,
      applicationPassword: site.applicationPassword,
      perPage: SITE_TITLE_LIMIT,
      signal,
    })
      .then((res) => (res.ok ? (res.titles ?? []) : []))
      .catch(() => []),
    Promise.resolve(
      supabase
        .from("post_items")
        .select("target_keyword, title")
        .eq("user_id", claim.userId)
        .eq("wp_site_id", site.id)
        .neq("target_keyword", "")
        .order("created_at", { ascending: false })
        .limit(PLANNED_KEYWORD_LIMIT)
    )
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) return []
        return (data as Array<{ target_keyword?: unknown; title?: unknown }>).flatMap((row) => [row.title, row.target_keyword])
      })
      .catch(() => []),
    getKeywordSuggestions({
      query: niche,
      language: request.language,
      limit: SEARCH_SUGGESTION_LIMIT,
      searxngUrl: request.userKeys.searxngUrl,
      signal,
    })
      .then((outcome) => (outcome.ok ? outcome.data.suggestions : []))
      .catch(() => []),
  ])

  return {
    existingTitles: uniquePlainTexts(titles, PROMPT_TITLE_MAX, SITE_TITLE_LIMIT),
    plannedKeywords: uniquePlainTexts(queued, PROMPT_TITLE_MAX, PLANNED_KEYWORD_LIMIT),
    searchSuggestions: uniquePlainTexts(suggestions, PROMPT_TITLE_MAX, SEARCH_SUGGESTION_LIMIT),
  }
}

/** Galat LLM yang tidak pulih dengan retry (kunci ditolak, kuota/kredit habis, request tidak valid). */
function isPermanentLlmError(err: unknown): boolean {
  const { kind } = classifyLlmError(err)
  return kind === "auth" || kind === "quota" || kind === "bad_request"
}

/** LLM menyusun `count` kata kunci unik (maks. `MAX_PLAN_ROUNDS` panggilan; putaran kedua hanya kekurangannya). */
async function draftKeywordPlan(
  request: NicheKeywordRequest,
  input: PlanContext & { niche: string; count: number; brief: string }
): Promise<{ keywords: string[]; rationale: string; llmCalls: number }> {
  const { userKeys, signal } = request
  const gateway = createLlmGateway({
    apiKey: userKeys.openrouterKey,
    modelCandidates: [request.model],
    tracing: userKeys,
    usage: request.usage,
    signal,
  })
  if (!gateway.hasKey) throw new NicheKeywordError(MISSING_OPENROUTER_KEY_MESSAGE, "permanent")

  const { systemPrompt, userPromptTemplate, outputSchema } = loadSectionedPrompt("system-niche-keyword-plan.md")
  const covered = new Set([...input.existingTitles, ...input.plannedKeywords].map(normalizeKeywordKey))
  const selected: string[] = []
  let rationale = ""
  let llmCalls = 0

  try {
    for (let round = 0; round < MAX_PLAN_ROUNDS && selected.length < input.count; round++) {
      const missing = input.count - selected.length
      llmCalls++
      const output = await gateway.completeJson<{ keywords?: unknown; rationale?: unknown }>({
        systemPrompt,
        userPrompt: renderPrompt(userPromptTemplate, {
          niche: input.niche,
          // Nama bahasa (bukan kode "en"): kode saja kerap diabaikan model.
          language: getLanguageDisplayName(request.language),
          count: String(missing + KEYWORD_BUFFER),
          siteName: request.site.siteName,
          brief: input.brief,
          // Data situs & mesin pencari hanya di blok data bertag pada pesan pengguna (bukan system prompt).
          siteData: toUntrustedPromptJson({
            existingTitles: input.existingTitles,
            plannedKeywords: [...input.plannedKeywords, ...selected],
            searchSuggestions: input.searchSuggestions,
          }),
        }),
        jsonSchema: outputSchema,
        temperature: 0.7,
        signal,
        runName: `Panitera Niche Keywords: ${input.niche.slice(0, 40)}`,
        tags: ["niche_keywords", "panitera"],
      })
      const picked = selectNicheKeywords(output?.keywords, covered, missing)
      for (const keyword of picked) covered.add(normalizeKeywordKey(keyword))
      selected.push(...picked)
      rationale ||= stripToPlainText(output?.rationale, RATIONALE_MAX)
    }
  } catch (err: unknown) {
    if (signal.aborted) throw err
    throw new NicheKeywordError(
      `Layanan AI gagal menyusun kata kunci niche (${describeLlmError(err)}). Periksa kunci API OpenRouter, kuota, atau model yang dipilih.`,
      isPermanentLlmError(err) ? "permanent" : "transient"
    )
  } finally {
    await gateway.flush()
  }

  if (selected.length < input.count) {
    throw new NicheKeywordError(
      `AI hanya menyusun ${selected.length} dari ${input.count} kata kunci unik untuk niche "${input.niche}".`,
      "transient"
    )
  }
  return { keywords: selected, rationale, llmCalls }
}
