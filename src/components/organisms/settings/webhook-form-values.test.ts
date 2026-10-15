import { describe, expect, it } from "vitest"
import { WebhookFormSchema } from "@/lib/validation/webhooks"
import { DEFAULT_WEBHOOK_EVENTS, toWebhookFormValues, toggleWebhookEvent } from "./webhook-form-values"

describe("toWebhookFormValues", () => {
  it("webhook baru: event default, secret kosong (dibuat acak server)", () => {
    expect(toWebhookFormValues()).toEqual({ name: "", url: "", events: DEFAULT_WEBHOOK_EVENTS, customSecret: "" })
  })

  it("ubah webhook: memakai data tersimpan dan membuang event yang tidak bisa dilanggan", () => {
    const values = toWebhookFormValues({
      name: "Slack",
      url: "https://hooks.example.com/in",
      events: ["post.failed", "test.ping"],
    })
    expect(values).toEqual({ name: "Slack", url: "https://hooks.example.com/in", events: ["post.failed"], customSecret: "" })
    expect(WebhookFormSchema.safeParse(values).success).toBe(true)
  })
})

describe("toggleWebhookEvent", () => {
  it("menambah event dengan urutan allowlist dan tanpa duplikat", () => {
    expect(toggleWebhookEvent(["batch.completed"], "post.published", true)).toEqual(["post.published", "batch.completed"])
    expect(toggleWebhookEvent(["post.published"], "post.published", true)).toEqual(["post.published"])
  })

  it("menghapus event", () => {
    expect(toggleWebhookEvent(["post.published", "post.failed"], "post.published", false)).toEqual(["post.failed"])
  })
})

describe("WebhookFormSchema", () => {
  const valid = toWebhookFormValues({ name: "n8n", url: "https://n8n.example.com/hook", events: ["post.published"] })

  it.each([
    ["event kosong", { ...valid, events: [] }, "events"],
    ["event test.ping", { ...valid, events: ["test.ping"] }, "events"],
    ["secret kustom terlalu pendek", { ...valid, customSecret: "pendek" }, "customSecret"],
    ["nama kosong", { ...valid, name: "   " }, "name"],
  ])("menolak %s", (_label, values, path) => {
    const result = WebhookFormSchema.safeParse(values)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path[0]).toBe(path)
  })

  it("secret kustom kosong = dibuat acak server", () => {
    expect(WebhookFormSchema.safeParse(valid).success).toBe(true)
  })
})
