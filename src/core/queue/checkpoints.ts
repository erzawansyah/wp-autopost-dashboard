import "server-only"
import type { OwnedPostItem, QueueDbClient } from "@/core/queue/batch-progress"
import type { GenerationCheckpoint, StoredGenerationCheckpoint } from "@/core/writer/runtime/checkpoints"

/**
 * Persistensi checkpoint generasi item antrean (`generation_checkpoints`, Service Role).
 *
 * - Baca: checkpoint milik pemilik klaim (filter `user_id` wajib) sebelum writer dijalankan; writer
 *   memvalidasi versi skema, bentuk data, dan sidik input sebelum memakai ulang.
 * - Tulis: HANYA lewat RPC `save_generation_checkpoint` yang dipagari token klaim + state
 *   `generating_content`, sehingga run basi (lease hilang) tidak menimpa checkpoint klaim baru.
 * - Hapus: setelah naskah tersimpan di `post_items` (transisi ke `syncing_to_wp`); sejak itu item tidak
 *   pernah digenerasi ulang (Cost-Saver Retry), jadi checkpoint tidak lagi berguna.
 */

/** Checkpoint tersimpan item ini. Gagal membaca → `[]` (run berjalan penuh, bukan gagal). */
export async function loadGenerationCheckpoints(
  supabase: QueueDbClient,
  item: Pick<OwnedPostItem, "id" | "userId">
): Promise<StoredGenerationCheckpoint[]> {
  const { data, error } = await supabase
    .from("generation_checkpoints")
    .select("step, schema_version, data")
    .eq("post_item_id", item.id)
    .eq("user_id", item.userId)
  if (error) {
    console.warn(`[queue] Gagal membaca checkpoint generasi item ${item.id}:`, error.message)
    return []
  }

  const rows: unknown[] = Array.isArray(data) ? data : []
  return rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return []
    const { step, schema_version: schemaVersion, data: payload } = row as Record<string, unknown>
    return typeof step === "string" && typeof schemaVersion === "number" ? [{ step, schemaVersion, data: payload }] : []
  })
}

/**
 * Simpan checkpoint dipagari klaim. `true` = tersimpan; `false` = item tidak lagi dipegang token klaim ini
 * dalam `generating_content`. Error database dilempar (writer mencatatnya ke telemetri).
 */
export async function saveGenerationCheckpoint(
  supabase: QueueDbClient,
  claim: { id: string; leaseToken: string },
  checkpoint: GenerationCheckpoint,
  promptVersions: Record<string, string>
): Promise<boolean> {
  const { data, error } = await supabase.rpc("save_generation_checkpoint", {
    p_post_item_id: claim.id,
    p_lease_token: claim.leaseToken,
    p_step: checkpoint.step,
    p_schema_version: checkpoint.schemaVersion,
    p_data: checkpoint.data,
    p_prompt_versions: promptVersions,
  })
  if (error) throw new Error(`Penyimpanan checkpoint gagal: ${error.message}`)
  return data === true
}

/** Hapus checkpoint item setelah naskah tersimpan (best-effort; sisa baris ikut terhapus bersama item). */
export async function clearGenerationCheckpoints(
  supabase: QueueDbClient,
  item: Pick<OwnedPostItem, "id" | "userId">
): Promise<void> {
  const { error } = await supabase
    .from("generation_checkpoints")
    .delete()
    .eq("post_item_id", item.id)
    .eq("user_id", item.userId)
  if (error) console.warn(`[queue] Gagal menghapus checkpoint generasi item ${item.id}:`, error.message)
}

/**
 * Buang checkpoint `draft` yang diduga beracun: langkah setelah draft (postprocess, persiapan sinkronisasi)
 * bersifat deterministik, jadi exception tak terduga akan terulang setiap kali draft yang sama dipakai.
 * Percobaan berikutnya menulis ulang naskah (checkpoint `pre_resolve` tetap dipakai). Best-effort.
 */
export async function discardDraftCheckpoint(
  supabase: QueueDbClient,
  item: Pick<OwnedPostItem, "id" | "userId">
): Promise<boolean> {
  const { error } = await supabase
    .from("generation_checkpoints")
    .delete()
    .eq("post_item_id", item.id)
    .eq("user_id", item.userId)
    .eq("step", "draft")
  if (error) console.warn(`[queue] Gagal membuang checkpoint draft item ${item.id}:`, error.message)
  return !error
}
