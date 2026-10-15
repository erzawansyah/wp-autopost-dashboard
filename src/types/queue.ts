import type { POST_ITEM_STATES } from "@/lib/validation/queue"
import type { SiteRef } from "./site"

/**
 * Tipe kanonis domain antrean/artikel/batch sesuai respons API (`/api/queue`, `/api/posts`, `/api/batches`).
 * Gantikan interface lokal di halaman/organism (`DashboardPost`, `BatchItemData`, …) saat halaman dirombak.
 */

/** 9 state `post_items.state` (PRD §4). */
export type PostItemState = (typeof POST_ITEM_STATES)[number]

/** CHECK `post_items_wp_target_status_check`. */
export type WpTargetStatus = "publish" | "future" | "draft"

/** CHECK `content_batches_execution_mode_check` + `instant` (grup virtual Tulis Cepat). */
export type BatchExecutionMode = "immediate" | "scheduled_drip" | "wp_future" | "instant"

/** CHECK `content_batches_status_check`. */
export type BatchStatus = "draft" | "running" | "paused" | "completed" | "failed"

/** CHECK `content_batches_source_type_check` + `quick_writer` (grup virtual Tulis Cepat). */
export type BatchSourceType = "csv_keywords" | "niche_auto" | "external_url" | "manual" | "quick_writer"

/** Relasi batch yang di-embed di item (`content_batches ( id, name, execution_mode )`). */
export interface BatchRef {
  id: string
  name: string
  execution_mode: BatchExecutionMode
}

/** Baris `GET /api/queue` (`{ items: QueueItem[] }`). Item tanpa batch memakai grup virtual Tulis Cepat. */
export interface QueueItem {
  id: string
  batch_id: string | null
  target_keyword: string
  title: string | null
  state: PostItemState
  wp_target_status: WpTargetStatus
  wp_post_id: number | null
  wp_post_url: string | null
  scheduled_for: string | null
  /** Jadwal percobaan berikutnya (retry/backoff/aksi manual). */
  next_attempt_at: string | null
  retry_count: number
  last_error: string | null
  created_at: string
  updated_at: string
  content_batches: BatchRef | null
  wp_sites: SiteRef | null
}

/** Baris `GET /api/posts` (`{ posts: PostListItem[] }`): `QueueItem` + metadata naskah. */
export interface PostListItem extends QueueItem {
  excerpt: string | null
  categories: string[] | null
  tags: string[] | null
  source_payload: Record<string, unknown> | null
}

export interface BatchScheduleConfig {
  mode?: "random" | "interval" | "instant"
  intervalConfig?: { intervalHours?: number }
}

/**
 * Baris `GET /api/batches` (`{ batches: Batch[] }`).
 * Catatan: grup virtual Tulis Cepat mengirim `wp_sites` sebagai array (`[site]`), batch biasa sebagai objek —
 * seragamkan di `src/server/queue/batches.ts` saat halaman batch dirombak.
 */
export interface Batch {
  id: string
  name: string
  source_type: BatchSourceType
  execution_mode: BatchExecutionMode
  status: BatchStatus
  total_items: number
  completed_items: number
  schedule_config: BatchScheduleConfig | null
  created_at: string
  updated_at: string
  wp_sites: SiteRef | SiteRef[] | null
}
