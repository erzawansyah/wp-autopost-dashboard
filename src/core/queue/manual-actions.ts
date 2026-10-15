import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Aksi manual pengguna atas item antrean ("Kirim ulang", "Tulis ulang", "Jalankan sekarang").
 * Route HTTP TIDAK lagi memproses item di dalam request: aksi ini hanya menjadwalkan ulang item
 * (`next_attempt_at = now`) lewat update bersyarat, lalu runner antrean yang mengerjakannya.
 *
 * Kolom antrean tidak dapat di-UPDATE client sesi (GRANT baseline), jadi modul ini memakai Service Role
 * dengan filter `user_id` pemilik WAJIB di setiap query (`userId` selalu dari sesi terverifikasi).
 */

export type QueueActionErrorCode = "not_found" | "not_retryable" | "in_progress" | "incomplete_content" | "already_on_wp"

export type QueueActionResult =
  | { ok: true; postId: string; state: string }
  | { ok: false; postId: string; code: QueueActionErrorCode; message: string; state?: string }

interface ActionItem {
  id: string
  user_id: string
  state: string
  title: string | null
  content_html: string | null
  wp_post_id: number | string | null
}

const IN_FLIGHT_STATES = ["generating_content", "syncing_to_wp"]
const FINAL_STATES = ["published_on_wp", "scheduled_on_wp", "saved_draft_on_wp"]
const SYNC_RETRY_STATES = ["failed_sync", "ready_to_sync"] as const

function hasStoredArticle(item: ActionItem): boolean {
  return Boolean(item.content_html && item.content_html.trim().length > 0 && item.title?.trim())
}

function failure(
  postId: string,
  code: QueueActionErrorCode,
  message: string,
  state?: string
): QueueActionResult {
  return { ok: false, postId, code, message, state }
}

const IN_PROGRESS_MESSAGE = "Artikel sedang diproses. Tunggu hingga selesai sebelum mencoba lagi."
const RACE_MESSAGE = "Status artikel baru saja berubah (diproses worker). Muat ulang lalu coba lagi."

async function loadOwnedItem(postId: string, userId: string): Promise<ActionItem | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("post_items")
    .select("id, user_id, state, title, content_html, wp_post_id")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(`Gagal membaca item antrean: ${error.message}`)
  // Defense-in-depth: item milik pengguna lain diperlakukan sama dengan "tidak ditemukan".
  if (!data || data.user_id !== userId) return null
  return data as ActionItem
}

/** Pemilik item untuk pemicu sistem (cron terotorisasi) yang tidak membawa sesi pengguna. */
export async function findPostItemOwner(postId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from("post_items").select("user_id").eq("id", postId).maybeSingle()
  if (error) throw new Error(`Gagal membaca item antrean: ${error.message}`)
  return typeof data?.user_id === "string" ? data.user_id : null
}

async function logAction(postId: string, userId: string, message: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from("execution_logs").insert({
    post_item_id: postId,
    user_id: userId,
    step: "manual_retry",
    level: "info",
    message,
  })
  if (error) console.warn(`[queue] Gagal menulis log aksi manual item ${postId}:`, error.message)
}

/**
 * Jadwalkan ulang item secara bersyarat (state lama harus masih sama) agar klik ganda / runner yang
 * baru saja mengklaim item tidak tertimpa. `retry_count` direset: aksi manual memulai jatah retry baru.
 */
async function reschedule(
  item: ActionItem,
  fromStates: readonly string[],
  patch: Record<string, unknown>,
  extraGuard?: "no_wp_post_id"
): Promise<boolean> {
  const supabase = createAdminClient()
  let query = supabase
    .from("post_items")
    .update({ next_attempt_at: new Date().toISOString(), retry_count: 0, last_error: null, ...patch })
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .in("state", [...fromStates])
  if (extraGuard === "no_wp_post_id") query = query.is("wp_post_id", null)
  const { data, error } = await query.select("id").maybeSingle()
  if (error) throw new Error(`Gagal menjadwalkan ulang item antrean: ${error.message}`)
  return Boolean(data)
}

/**
 * "Kirim ulang" (Cost-Saver Retry): `failed_sync`/`ready_to_sync` dengan naskah tersimpan →
 * `ready_to_sync` + `next_attempt_at = now`. Runner mengirim naskah tersimpan tanpa AI.
 */
export async function requestPostItemSyncRetry(params: { postId: string; userId: string }): Promise<QueueActionResult> {
  const { postId, userId } = params
  const item = await loadOwnedItem(postId, userId)
  if (!item) return failure(postId, "not_found", "Artikel tidak ditemukan.")

  if (IN_FLIGHT_STATES.includes(item.state)) return failure(postId, "in_progress", IN_PROGRESS_MESSAGE, item.state)
  if (!(SYNC_RETRY_STATES as readonly string[]).includes(item.state)) {
    return failure(postId, "not_retryable", "Artikel ini tidak berada dalam status yang dapat dikirim ulang.", item.state)
  }
  if (!hasStoredArticle(item)) {
    return failure(postId, "incomplete_content", "Konten artikel belum lengkap untuk dikirim ke WordPress.", item.state)
  }
  if (item.wp_post_id) {
    return failure(
      postId,
      "already_on_wp",
      `Artikel ini sudah tercatat di WordPress (WP ID #${item.wp_post_id}). Periksa langsung di wp-admin.`,
      item.state
    )
  }

  const scheduled = await reschedule(item, SYNC_RETRY_STATES, { state: "ready_to_sync" }, "no_wp_post_id")
  if (!scheduled) return failure(postId, "in_progress", RACE_MESSAGE, item.state)

  await logAction(postId, userId, "[Kirim Ulang] Pengiriman ulang naskah tersimpan dijadwalkan (tanpa generasi AI).")
  return { ok: true, postId, state: "ready_to_sync" }
}

/**
 * "Jalankan sekarang" / "Tulis ulang" untuk satu item milik pengguna:
 * - `queued_input` → diklaim secepatnya (`next_attempt_at = now`);
 * - `failed_generation` (atau `failed_sync` tanpa naskah) → `queued_input` untuk generasi ulang;
 * - `failed_sync`/`ready_to_sync` dengan naskah → sama dengan "Kirim ulang" (tanpa AI).
 * `forceNow` (tombol eksplisit "Jalankan sekarang") mengosongkan jadwal tayang sehingga artikel
 * diterbitkan saat selesai, bukan sebagai `future` di slot jadwal.
 */
export async function requestPostItemRun(params: {
  postId: string
  userId: string
  forceNow?: boolean
}): Promise<QueueActionResult> {
  const { postId, userId, forceNow = false } = params
  const item = await loadOwnedItem(postId, userId)
  if (!item) return failure(postId, "not_found", "Artikel tidak ditemukan.")

  if (FINAL_STATES.includes(item.state)) return { ok: true, postId, state: item.state }
  if (IN_FLIGHT_STATES.includes(item.state)) return failure(postId, "in_progress", IN_PROGRESS_MESSAGE, item.state)

  if ((SYNC_RETRY_STATES as readonly string[]).includes(item.state) && hasStoredArticle(item)) {
    return requestPostItemSyncRetry({ postId, userId })
  }

  const schedulePatch = forceNow ? { scheduled_for: null } : {}
  const fromStates = ["queued_input", "failed_generation", "failed_sync"] as const
  if (!(fromStates as readonly string[]).includes(item.state)) {
    return failure(postId, "not_retryable", "Artikel ini tidak berada dalam status yang dapat diproses ulang.", item.state)
  }

  const scheduled = await reschedule(item, [item.state], { state: "queued_input", ...schedulePatch })
  if (!scheduled) return failure(postId, "in_progress", RACE_MESSAGE, item.state)

  await logAction(
    postId,
    userId,
    item.state === "queued_input"
      ? "[Jalankan Sekarang] Item diprioritaskan untuk diproses runner antrean."
      : "[Tulis Ulang] Item dikembalikan ke antrean untuk generasi ulang."
  )
  return { ok: true, postId, state: "queued_input" }
}
