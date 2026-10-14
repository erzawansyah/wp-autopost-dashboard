import crypto from "crypto"
import { describe, expect, it } from "vitest"
import {
  buildWebhookHeaders,
  signWebhookPayload,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "@/lib/webhooks/signature"

const SECRET = "rahasia-uji"
const BODY = JSON.stringify({ id: "1", event: "post.published", timestamp: "2026-10-14T00:00:00.000Z", data: {} })

describe("signWebhookPayload", () => {
  it("menandatangani `${timestamp}.${rawBody}` dengan HMAC-SHA256 hex", () => {
    const expected = crypto.createHmac("sha256", SECRET).update(`1760400000.${BODY}`).digest("hex")
    expect(signWebhookPayload(SECRET, 1760400000, BODY)).toBe(expected)
  })

  it("berubah bila timestamp berubah (replay dengan timestamp baru tidak lolos)", () => {
    expect(signWebhookPayload(SECRET, 1760400000, BODY)).not.toBe(signWebhookPayload(SECRET, 1760400001, BODY))
  })

  it("berubah bila secret atau body berubah", () => {
    const base = signWebhookPayload(SECRET, 1760400000, BODY)
    expect(signWebhookPayload("secret-lain", 1760400000, BODY)).not.toBe(base)
    expect(signWebhookPayload(SECRET, 1760400000, `${BODY} `)).not.toBe(base)
  })
})

describe("buildWebhookHeaders", () => {
  it("mengirim timestamp unix detik dan signature sha256=<hex> yang cocok", () => {
    const nowMs = 1760400000999
    const headers = buildWebhookHeaders({ secret: SECRET, event: "post.published", rawBody: BODY, nowMs })

    expect(headers[WEBHOOK_TIMESTAMP_HEADER]).toBe("1760400000")
    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(`sha256=${signWebhookPayload(SECRET, 1760400000, BODY)}`)
    expect(headers["X-Webhook-Event"]).toBe("post.published")
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("tidak lagi mengirim header format lama", () => {
    const headers = buildWebhookHeaders({ secret: SECRET, event: "test.ping", rawBody: BODY })
    expect(headers).not.toHaveProperty("X-Hub-Signature-256")
    expect(headers).not.toHaveProperty("X-Webhook-Timestamp")
  })

  it("menolak secret kosong (tidak ada fallback secret)", () => {
    expect(() => buildWebhookHeaders({ secret: "", event: "test.ping", rawBody: BODY })).toThrow()
  })
})
