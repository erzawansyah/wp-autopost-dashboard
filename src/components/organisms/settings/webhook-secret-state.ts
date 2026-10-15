/**
 * State murni dialog secret webhook satu kali (`WebhookSecretRevealProvider`). Diuji di `webhook-secret-state.test.ts`.
 *
 * Secret plaintext hanya dikembalikan server sekali (respons pembuatan). State ini hidup di level halaman agar
 * dialog tidak ikut hilang saat tombol pembuatnya unmount (status kosong daftar webhook diganti kartu), dan
 * secret dibuang dari memori segera setelah dialog selesai ditutup.
 */

export interface CreatedWebhookSecret {
  name: string
  secret: string
}

export interface WebhookSecretRevealState {
  created: CreatedWebhookSecret | null
  open: boolean
}

export type WebhookSecretRevealAction =
  | { type: "reveal"; created: CreatedWebhookSecret }
  /** Pengguna menutup dialog; secret dipertahankan selama animasi tutup agar isi dialog tidak berkedip kosong. */
  | { type: "close" }
  /** Animasi tutup selesai: secret dibuang (kecuali dialog sudah dibuka lagi untuk secret baru). */
  | { type: "closed" }

export const INITIAL_WEBHOOK_SECRET_REVEAL: WebhookSecretRevealState = { created: null, open: false }

export function webhookSecretRevealReducer(
  state: WebhookSecretRevealState,
  action: WebhookSecretRevealAction
): WebhookSecretRevealState {
  switch (action.type) {
    case "reveal":
      return { created: action.created, open: true }
    case "close":
      return state.open ? { ...state, open: false } : state
    case "closed":
      return state.open || state.created === null ? state : INITIAL_WEBHOOK_SECRET_REVEAL
  }
}
