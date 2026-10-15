"use client"

import * as React from "react"
import { WebhookSecretDialog } from "./webhook-secret-dialog"
import {
  INITIAL_WEBHOOK_SECRET_REVEAL,
  webhookSecretRevealReducer,
  type CreatedWebhookSecret,
} from "./webhook-secret-state"

type RevealWebhookSecret = (created: CreatedWebhookSecret) => void

const RevealWebhookSecretContext = React.createContext<RevealWebhookSecret | null>(null)

/**
 * Pemegang dialog secret webhook satu kali di level halaman `/settings/webhooks`. Tombol "Tambah Webhook"
 * (header maupun status kosong daftar) hanya memanggil `reveal`; dialog tetap ter-mount walau tombol pembuatnya
 * hilang saat daftar diperbarui. Secret dibuang dari memori setelah dialog selesai ditutup.
 */
export function WebhookSecretRevealProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(webhookSecretRevealReducer, INITIAL_WEBHOOK_SECRET_REVEAL)
  const reveal = React.useCallback<RevealWebhookSecret>((created) => dispatch({ type: "reveal", created }), [])

  return (
    <RevealWebhookSecretContext value={reveal}>
      {children}
      <WebhookSecretDialog
        created={state.created}
        open={state.open}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: "close" })
        }}
        onClosed={() => dispatch({ type: "closed" })}
      />
    </RevealWebhookSecretContext>
  )
}

export function useRevealWebhookSecret(): RevealWebhookSecret {
  const reveal = React.use(RevealWebhookSecretContext)
  if (!reveal) throw new Error("useRevealWebhookSecret() harus dipakai di dalam <WebhookSecretRevealProvider>.")
  return reveal
}
