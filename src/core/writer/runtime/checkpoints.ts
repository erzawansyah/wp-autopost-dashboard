import { createHash } from "node:crypto"
import { z } from "zod"
import type { LlmModelUsage, LlmUsageSnapshot, LlmUsageTotals } from "@/core/shared/llm/usage"
import type { WriterRequest } from "../types/contracts"
import type { AgentProfile } from "../types/profile"

/**
 * Checkpoint generasi (resume tanpa LLM ulang).
 *
 * Satu run Agent Profile dipecah menjadi langkah idempoten yang hasilnya dapat disimpan pemanggil
 * (worker antrean → tabel `generation_checkpoints` via RPC berpagar klaim):
 * 1. `pre_resolve` — taksonomi & persona author hasil Pre-Flight Resolver (LLM + request WordPress,
 *    termasuk tag yang sudah dibuat di WordPress);
 * 2. `draft` — naskah Markdown mentah (setelah agent loop + finalize bila perlu) beserta konteks
 *    pre_resolve yang dipakainya, sumber riset, dan media yang sudah diunggah tool ke WordPress.
 * Postprocess Markdown → Gutenberg bersifat deterministik sehingga selalu dijalankan ulang.
 *
 * Percobaan berikutnya untuk item yang sama melanjutkan dari langkah valid terakhir. Checkpoint
 * diabaikan (dijalankan ulang) bila versi skema berbeda, datanya tidak lolos validasi, atau sidik
 * input (`inputKey`) tidak cocok — mis. Agent Profile kustom diubah atau situs tujuan diganti.
 * Model LLM & isi prompt bawaan sengaja tidak termasuk sidik: naskah yang sudah valid tidak dibuang
 * hanya karena deploy mengubah prompt (versi prompt tetap tercatat di `prompt_versions`).
 */

export const GENERATION_STEPS = ["pre_resolve", "draft"] as const

export type GenerationStep = (typeof GENERATION_STEPS)[number]

/** Versi bentuk `data`. Naikkan setiap kali skema di bawah berubah: checkpoint versi lain diabaikan. */
export const GENERATION_CHECKPOINT_SCHEMA_VERSION = 1

/**
 * Batas ukuran JSON `data` yang dikirim ke penyimpanan (byte UTF-8). Di bawah CHECK database
 * (256 KiB teks jsonb) karena representasi teks jsonb sedikit lebih panjang dari `JSON.stringify`.
 */
export const GENERATION_CHECKPOINT_MAX_BYTES = 200 * 1024

// ---------------------------------------------------------------------------
// Skema data per langkah
// ---------------------------------------------------------------------------

const CountSchema = z.number().int().nonnegative()
const PositiveIdSchema = z.number().int().positive()
/** String opsional; `null` dari JSON lama/LLM dinormalkan menjadi `undefined`. */
const OptionalTextSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

const UsageTotalsShape = {
  calls: CountSchema,
  failedCalls: CountSchema,
  promptTokens: CountSchema,
  completionTokens: CountSchema,
  totalTokens: CountSchema,
  reasoningTokens: CountSchema,
  cachedPromptTokens: CountSchema,
  costUsd: z.number().nonnegative().nullable(),
}

/** Pemakaian LLM satu langkah (selisih ledger run sebelum/sesudah langkah). */
const StepUsageSchema = z.object({
  ...UsageTotalsShape,
  byModel: z.array(z.object({ model: z.string().min(1), ...UsageTotalsShape })),
})

const PreResolvedSchema = z.object({
  author: z
    .object({ id: PositiveIdSchema, name: z.string(), bio: OptionalTextSchema, slug: OptionalTextSchema })
    .optional(),
  categoryIds: z.array(z.number().int()),
  categoryNames: z.array(z.string()),
  tagNames: z.array(z.string()),
  tagIds: z.array(z.number().int()),
})

const ArticleSourceSchema = z.object({
  url: z.string().min(1),
  title: OptionalTextSchema,
  snippet: OptionalTextSchema,
  readFull: z.boolean().optional(),
})

const FeaturedImageSchema = z.object({
  title: z.string(),
  imageUrl: z.string(),
  originalUrl: z.string(),
  explanation: z.string(),
  wpMediaId: PositiveIdSchema.optional(),
  altText: OptionalTextSchema,
  caption: OptionalTextSchema,
})

const InContentImageSchema = z.object({
  subheading: z.string(),
  imageUrl: z.string(),
  altText: z.string(),
  originalUrl: OptionalTextSchema,
  caption: OptionalTextSchema,
  wpMediaId: PositiveIdSchema.optional(),
  usageDescription: OptionalTextSchema,
})

/** Keluaran naskah mentah (sebelum postprocess) yang dipakai jalur sukses `runAgentWriter`. */
const DraftOutputSchema = z.object({
  title: OptionalTextSchema,
  excerpt: OptionalTextSchema,
  /** Kriteria naskah valid sama dengan jalur sukses run (≥ 200 karakter). */
  markdownContent: z.string().min(200),
  categoryIds: z.array(z.number().int()).optional(),
  authorId: z.number().int().optional(),
  featuredMediaId: z.number().int().optional(),
})

export const PreResolveCheckpointDataSchema = z.object({
  inputKey: z.string().min(1),
  preResolved: PreResolvedSchema,
  usage: StepUsageSchema,
})

export const DraftCheckpointDataSchema = z.object({
  inputKey: z.string().min(1),
  /** Model utama gateway yang menulis naskah. */
  model: z.string().min(1),
  /** Konteks pre_resolve yang dipakai naskah (resume dari draft tidak bergantung checkpoint lain). */
  preResolved: PreResolvedSchema,
  output: DraftOutputSchema,
  stopReason: z.string().min(1),
  sources: z.array(ArticleSourceSchema),
  /** Media yang sudah dipilih/diunggah tool: dipulihkan agar tidak dicari/diunggah ulang. */
  featuredImage: FeaturedImageSchema.optional(),
  featuredMediaId: PositiveIdSchema.optional(),
  inContentImages: z.array(InContentImageSchema),
  /** Pemakaian LLM langkah ini (agent loop + finalize), tanpa pre_resolve. */
  usage: StepUsageSchema,
})

/** Data checkpoint tersimpan yang lolos validasi (dipakai saat resume). */
export type PreResolveCheckpointData = z.output<typeof PreResolveCheckpointDataSchema>
export type DraftCheckpointData = z.output<typeof DraftCheckpointDataSchema>

/** Checkpoint langkah yang baru selesai, siap disimpan pemanggil (bentuk masukan skema). */
export type GenerationCheckpoint =
  | { step: "pre_resolve"; schemaVersion: number; data: z.input<typeof PreResolveCheckpointDataSchema> }
  | { step: "draft"; schemaVersion: number; data: z.input<typeof DraftCheckpointDataSchema> }

/** Checkpoint tersimpan dari percobaan sebelumnya (mis. baris DB), belum divalidasi. */
export interface StoredGenerationCheckpoint {
  step: string
  schemaVersion: number
  data: unknown
}

export interface GenerationCheckpointOptions {
  /** Checkpoint item yang sama dari percobaan sebelumnya; yang tidak valid diabaikan (dicatat telemetri). */
  resume?: readonly StoredGenerationCheckpoint[]
  /**
   * Dipanggil setiap langkah selesai. `true` = tersimpan; `false` = ditolak penyimpanan (mis. klaim
   * antrean sudah berpindah). Error dicatat ke telemetri tanpa menggagalkan run.
   */
  onCheckpoint?: (checkpoint: GenerationCheckpoint) => Promise<boolean> | boolean
}

// ---------------------------------------------------------------------------
// Sidik input
// ---------------------------------------------------------------------------

export interface GenerationInputKeys {
  preResolve: string
  draft: string
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

/**
 * Sidik input tiap langkah: checkpoint hanya dipakai ulang bila input yang memengaruhi langkah itu sama.
 * Sidik `draft` mencakup seluruh input `pre_resolve`.
 */
export function computeGenerationInputKeys(
  request: WriterRequest,
  profile: Pick<AgentProfile, "ref" | "mode" | "updatedAt">
): GenerationInputKeys {
  const preResolveInput = {
    keyword: request.content.keyword,
    language: request.content.language || "id",
    brief: request.content.brief ?? null,
    site: request.site?.baseUrl
      ? { baseUrl: request.site.baseUrl.trim().toLowerCase(), username: request.site.username ?? null }
      : null,
    authorId: request.publishing.authorId ?? null,
    categoryIds: request.publishing.categoryIds,
    tagNames: request.publishing.tagNames,
  }
  const draftInput = {
    preResolve: preResolveInput,
    title: request.content.title ?? null,
    style: request.content.style,
    wordCountTarget: request.content.wordCountTarget ?? null,
    customInstructions: request.customInstructions ?? null,
    profile: { ref: profile.ref, mode: profile.mode, updatedAt: profile.updatedAt ?? null },
  }
  return { preResolve: digest(preResolveInput), draft: digest(draftInput) }
}

// ---------------------------------------------------------------------------
// Rencana resume
// ---------------------------------------------------------------------------

export type IgnoredCheckpointReason = "unknown_step" | "schema_version" | "invalid_data" | "input_changed"

export interface ResumePlan {
  preResolve?: PreResolveCheckpointData
  draft?: DraftCheckpointData
  /** Checkpoint yang ditemukan tetapi tidak dipakai (untuk telemetri). */
  ignored: Array<{ step: string; reason: IgnoredCheckpointReason }>
}

function isGenerationStep(step: string): step is GenerationStep {
  return (GENERATION_STEPS as readonly string[]).includes(step)
}

/** Pilih checkpoint valid per langkah dari data tersimpan (versi skema, validasi zod, sidik input). */
export function planGenerationResume(
  stored: readonly StoredGenerationCheckpoint[] | undefined,
  keys: GenerationInputKeys
): ResumePlan {
  const plan: ResumePlan = { ignored: [] }
  for (const checkpoint of stored ?? []) {
    const { step } = checkpoint
    if (!isGenerationStep(step)) {
      plan.ignored.push({ step, reason: "unknown_step" })
      continue
    }
    if (checkpoint.schemaVersion !== GENERATION_CHECKPOINT_SCHEMA_VERSION) {
      plan.ignored.push({ step, reason: "schema_version" })
      continue
    }
    if (step === "pre_resolve") {
      const parsed = PreResolveCheckpointDataSchema.safeParse(checkpoint.data)
      if (!parsed.success) plan.ignored.push({ step, reason: "invalid_data" })
      else if (parsed.data.inputKey !== keys.preResolve) plan.ignored.push({ step, reason: "input_changed" })
      else plan.preResolve = parsed.data
    } else {
      const parsed = DraftCheckpointDataSchema.safeParse(checkpoint.data)
      if (!parsed.success) plan.ignored.push({ step, reason: "invalid_data" })
      else if (parsed.data.inputKey !== keys.draft) plan.ignored.push({ step, reason: "input_changed" })
      else plan.draft = parsed.data
    }
  }
  return plan
}

// ---------------------------------------------------------------------------
// Pemakaian per langkah
// ---------------------------------------------------------------------------

/** Pembulatan 1e-9 USD (sama dengan ledger) agar selisih float tidak berekor panjang. */
function roundUsd(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

function subtractTotals(after: LlmUsageTotals, before: LlmUsageTotals | undefined): LlmUsageTotals {
  const minus = (key: Exclude<keyof LlmUsageTotals, "costUsd">) => Math.max(0, after[key] - (before?.[key] ?? 0))
  return {
    calls: minus("calls"),
    failedCalls: minus("failedCalls"),
    promptTokens: minus("promptTokens"),
    completionTokens: minus("completionTokens"),
    totalTokens: minus("totalTokens"),
    reasoningTokens: minus("reasoningTokens"),
    cachedPromptTokens: minus("cachedPromptTokens"),
    costUsd: after.costUsd === null ? null : roundUsd(Math.max(0, after.costUsd - (before?.costUsd ?? 0))),
  }
}

/** Pemakaian LLM di antara dua snapshot ledger yang sama (per model & total). */
export function usageSince(before: LlmUsageSnapshot, after: LlmUsageSnapshot): LlmUsageSnapshot {
  const byModel: LlmModelUsage[] = after.byModel
    .map((entry) => ({ ...subtractTotals(entry, before.byModel.find((b) => b.model === entry.model)), model: entry.model }))
    .filter((entry) => entry.calls > 0 || entry.failedCalls > 0)
  return { ...subtractTotals(after, before), byModel }
}

/** Ukuran JSON data checkpoint (byte UTF-8). */
export function checkpointByteLength(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data), "utf8")
}

/** Ringkasan pemakaian untuk telemetri, mis. "3 panggilan LLM, 12.345 token, $0.012300". */
export function describeStepUsage(usage: LlmUsageTotals): string {
  const cost = usage.costUsd === null ? "biaya tidak dilaporkan" : `$${usage.costUsd.toFixed(6)}`
  return `${usage.calls} panggilan LLM, ${usage.totalTokens.toLocaleString("id-ID")} token, ${cost}`
}
