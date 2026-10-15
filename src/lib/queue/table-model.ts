import { QUICK_WRITER_BATCH_ID, QUICK_WRITER_BATCH_NAME } from "@/lib/validation/queue"
import type { PostItemState, PostListItem, QueueItem, WpTargetStatus } from "@/types/queue"
import { IN_FLIGHT_STATES } from "./states"

/**
 * Model baris tabel antrean (`QueueDataTable`) — modul murni: pemetaan respons API → baris, kategori,
 * pencarian, dan nilai urut kolom waktu.
 */

/** Baris tabel antrean (dari `QueueItem` `/api/queue` atau `PostListItem` `/api/posts`). */
export interface QueueTableItem {
  id: string
  title: string
  targetKeyword: string
  siteName: string
  siteDomain: string
  /** Nama kategori (tanpa ID numerik baris lama). */
  categories: string[]
  status: PostItemState
  /** `WpTargetStatus`; string longgar agar baris dari respons tanpa tipe tetap dapat dipakai. */
  wpTargetStatus?: WpTargetStatus | (string & {})
  wpPostId?: number | null
  wpPostUrl?: string
  createdAt?: string
  updatedAt?: string
  scheduledFor?: string
  /** Jadwal percobaan berikutnya (retry/backoff/aksi manual). */
  nextAttemptAt?: string
  aiModel?: string
  lastError?: string
  /** UUID batch atau `quick-writer` (grup virtual Tulis Cepat); kosong = Tulis Cepat. */
  batchId?: string
  batchName?: string
}

/** ID grup baris (kosong → grup virtual Tulis Cepat). */
export function batchIdOf(item: Pick<QueueTableItem, "batchId">): string {
  return item.batchId || QUICK_WRITER_BATCH_ID
}

/** `https://blog.com/` → `blog.com`. */
export function formatSiteDomain(baseUrl: string | null | undefined): string {
  if (!baseUrl) return "-"
  return baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") || "-"
}

function readNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0 && Number.isNaN(Number(entry)))
}

/**
 * Nama kategori artikel: kolom `categories` (baris lama berisi ID numerik → diabaikan), lalu
 * `source_payload.category_names`, lalu `source_payload.categoryList`.
 */
export function extractCategoryNames(
  categories: unknown,
  sourcePayload?: Record<string, unknown> | null
): string[] {
  for (const candidate of [categories, sourcePayload?.category_names, sourcePayload?.categoryList]) {
    const names = readNameList(candidate)
    if (names.length > 0) return names
  }
  return []
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

/** Respons API → baris tabel. Item tanpa batch masuk grup virtual Tulis Cepat. */
export function toQueueTableItem(item: QueueItem | PostListItem): QueueTableItem {
  const payload = "source_payload" in item ? item.source_payload : null
  const batchId = item.batch_id ?? QUICK_WRITER_BATCH_ID
  return {
    id: item.id,
    title: item.title || item.target_keyword,
    targetKeyword: item.target_keyword,
    siteName: item.wp_sites?.site_name || "WordPress",
    siteDomain: formatSiteDomain(item.wp_sites?.base_url),
    categories: extractCategoryNames("categories" in item ? item.categories : null, payload),
    status: item.state,
    wpTargetStatus: item.wp_target_status,
    wpPostId: item.wp_post_id,
    wpPostUrl: item.wp_post_url ?? undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    scheduledFor: item.scheduled_for ?? undefined,
    nextAttemptAt: item.next_attempt_at ?? undefined,
    aiModel: readString(payload?.aiModel),
    lastError: item.last_error ?? undefined,
    batchId,
    batchName:
      batchId === QUICK_WRITER_BATCH_ID
        ? QUICK_WRITER_BATCH_NAME
        : item.content_batches?.name || readString(payload?.batch_name) || "Batch tanpa nama",
  }
}

/** Pencarian bebas: judul, topik, situs, domain, nama batch, kategori (tanpa beda huruf besar/kecil). */
export function matchesQueueSearch(item: QueueTableItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [item.title, item.targetKeyword, item.siteName, item.siteDomain, item.batchName ?? "", ...item.categories].some(
    (value) => value.toLowerCase().includes(needle)
  )
}

/** Kolom "Waktu & Publikasi" sedang menampilkan apa (label + waktu acuan). */
export type ScheduleKind = "published" | "scheduled_on_wp" | "draft" | "failed" | "planned" | "queued"

export function scheduleKindOf(item: QueueTableItem, now: number): ScheduleKind {
  switch (item.status) {
    case "published_on_wp":
      return "published"
    case "scheduled_on_wp":
      return "scheduled_on_wp"
    case "saved_draft_on_wp":
      return "draft"
    case "failed_generation":
    case "failed_sync":
      return "failed"
    default: {
      const planned = item.scheduledFor ? Date.parse(item.scheduledFor) : Number.NaN
      return IN_FLIGHT_STATES.has(item.status) && planned > now ? "planned" : "queued"
    }
  }
}

/** Waktu acuan kolom jadwal (ISO) sesuai jenisnya. */
export function scheduleTimeOf(item: QueueTableItem, kind: ScheduleKind): string | undefined {
  switch (kind) {
    case "scheduled_on_wp":
      return item.scheduledFor ?? item.updatedAt
    case "planned":
      return item.scheduledFor
    case "queued":
      return item.createdAt
    default:
      return item.updatedAt
  }
}
