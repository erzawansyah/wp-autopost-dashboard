import { describe, expect, it } from "vitest"
import {
  INITIAL_WEBHOOK_SECRET_REVEAL,
  webhookSecretRevealReducer,
  type WebhookSecretRevealAction,
  type WebhookSecretRevealState,
} from "./webhook-secret-state"

function run(actions: WebhookSecretRevealAction[], initial = INITIAL_WEBHOOK_SECRET_REVEAL): WebhookSecretRevealState {
  return actions.reduce(webhookSecretRevealReducer, initial)
}

const FIRST = { name: "Slack", secret: "rahasia-satu" }
const SECOND = { name: "Zapier", secret: "rahasia-dua" }

describe("webhookSecretRevealReducer", () => {
  it("secret tampil sampai ditutup, tetap ada selama animasi tutup, lalu dibuang dari memori", () => {
    const shown = run([{ type: "reveal", created: FIRST }])
    expect(shown).toEqual({ created: FIRST, open: true })

    const closing = webhookSecretRevealReducer(shown, { type: "close" })
    expect(closing).toEqual({ created: FIRST, open: false })

    expect(webhookSecretRevealReducer(closing, { type: "closed" })).toEqual(INITIAL_WEBHOOK_SECRET_REVEAL)
  })

  it("secret baru yang dibuka sebelum animasi tutup selesai tidak ikut dibuang", () => {
    const reopened = run([{ type: "reveal", created: FIRST }, { type: "close" }, { type: "reveal", created: SECOND }])
    expect(webhookSecretRevealReducer(reopened, { type: "closed" })).toEqual({ created: SECOND, open: true })
  })

  it("aksi tutup tanpa dialog terbuka tidak mengubah state", () => {
    const idle = INITIAL_WEBHOOK_SECRET_REVEAL
    expect(webhookSecretRevealReducer(idle, { type: "close" })).toBe(idle)
    expect(webhookSecretRevealReducer(idle, { type: "closed" })).toBe(idle)
  })
})
