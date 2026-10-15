/**
 * State murni banner "Artikel masuk antrean" di Dashboard (`QueuedPostNotice`). Diuji di
 * `queued-post-notice-state.test.ts`.
 *
 * Payload berasal dari redirect Tulis Cepat (`/?queued=true&postId=…&keyword=…`). Parameter itu segera dihapus
 * dari address bar (`DismissibleAlert.clearSearchParams`), dan render ulang RSC berikutnya (`router.refresh()`
 * tabel artikel) tidak lagi membawanya — jadi banner disimpan di state client dan bertahan sampai ditutup.
 */

export interface QueuedPostPayload {
  keyword?: string
  postId?: string
}

export interface QueuedPostNoticeData extends QueuedPostPayload {
  /** Identitas payload; berubah hanya bila redirect membawa artikel lain (banner tampil lagi). */
  key: string
}

/**
 * Banner berikutnya: payload kosong (parameter sudah dibersihkan) mempertahankan banner saat ini; payload dengan
 * identitas sama dikembalikan apa adanya (referensi sama → tanpa render ulang); payload baru menggantikannya.
 */
export function nextQueuedPostNotice(
  current: QueuedPostNoticeData | null,
  incoming: QueuedPostPayload | null
): QueuedPostNoticeData | null {
  if (!incoming) return current
  const key = JSON.stringify([incoming.postId ?? "", incoming.keyword ?? ""])
  return current?.key === key ? current : { key, keyword: incoming.keyword, postId: incoming.postId }
}
