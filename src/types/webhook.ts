export type WebhookEvent =
  | "post.published"
  | "post.scheduled"
  | "post.draft_saved"
  | "post.failed"
  | "batch.completed"
  | "batch.failed"
  | "test.ping"

export const AVAILABLE_WEBHOOK_EVENTS: { event: WebhookEvent; label: string; description: string }[] = [
  {
    event: "post.published",
    label: "Artikel Diterbitkan (Published)",
    description: "Dipicu saat artikel berhasil tayang langsung di situs WordPress.",
  },
  {
    event: "post.scheduled",
    label: "Artikel Terjadwal (Scheduled)",
    description: "Dipicu saat artikel berhasil dijadwalkan di WordPress untuk tanggal mendatang.",
  },
  {
    event: "post.draft_saved",
    label: "Draf Tersimpan (Draft)",
    description: "Dipicu saat artikel disimpan sebagai draf di WordPress.",
  },
  {
    event: "post.failed",
    label: "Kegagalan Artikel (Failed)",
    description: "Dipicu jika pembuatan konten AI atau pengiriman ke WordPress gagal.",
  },
  {
    event: "batch.completed",
    label: "Batch Selesai (Batch Completed)",
    description: "Dipicu ketika seluruh item dalam satu antrean batch selesai diproses.",
  },
  {
    event: "batch.failed",
    label: "Batch Gagal (Batch Failed)",
    description: "Dipicu jika seluruh antrean batch berhenti atau mengalami kegagalan fatal.",
  },
]

export interface WebhookItem {
  id: string
  user_id: string
  name: string
  url: string
  events: WebhookEvent[]
  is_active: boolean
  created_at: string
  updated_at: string
  // Plaintext secret hanya diberikan 1x saat CREATE agar user bisa menyalin
  secret?: string
}

export interface WebhookPayload<T = Record<string, unknown>> {
  id: string
  event: WebhookEvent
  timestamp: string
  data: T
}
