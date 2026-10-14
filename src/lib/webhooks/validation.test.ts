import { afterEach, describe, expect, it, vi } from "vitest"
import { getWebhookUrlPolicyError, parseWebhookEvents, validateWebhookUrl } from "@/lib/webhooks/validation"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("parseWebhookEvents", () => {
  it("menerima event dari allowlist dan menghapus duplikat", () => {
    expect(parseWebhookEvents(["post.published", "batch.completed", "post.published"])).toEqual([
      "post.published",
      "batch.completed",
    ])
  })

  it.each([
    [undefined],
    [[]],
    ["post.published"],
    [["post.published", "post.deleted"]],
    [["test.ping"]],
    [[42]],
  ])("menolak %j", (input) => {
    expect(parseWebhookEvents(input)).toBeNull()
  })
})

describe("getWebhookUrlPolicyError", () => {
  it("mengizinkan https publik", () => {
    expect(getWebhookUrlPolicyError(new URL("https://hooks.example.com/abc"))).toBeNull()
  })

  it("mengizinkan http di luar production", () => {
    expect(getWebhookUrlPolicyError(new URL("http://hooks.example.com/abc"))).toBeNull()
  })

  it("mewajibkan https di production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(getWebhookUrlPolicyError(new URL("http://hooks.example.com/abc"))).toMatch(/HTTPS/)
  })

  it("menolak kredensial di URL dan protokol selain http/https", () => {
    expect(getWebhookUrlPolicyError(new URL("https://user:pass@hooks.example.com/"))).not.toBeNull()
    expect(getWebhookUrlPolicyError(new URL("ftp://hooks.example.com/"))).not.toBeNull()
  })

  it("menolak origin internal milik platform (SearXNG)", () => {
    expect(getWebhookUrlPolicyError(new URL("http://searxng-internal:8080/search"))).not.toBeNull()
  })
})

describe("validateWebhookUrl", () => {
  it("menerima IP publik literal dan mengembalikan URL ternormalisasi", async () => {
    await expect(validateWebhookUrl(" https://93.184.216.34/hook ")).resolves.toEqual({
      ok: true,
      url: "https://93.184.216.34/hook",
    })
  })

  it.each(["", "   ", 123, "bukan url"])("menolak input tidak valid %j", async (input) => {
    const result = await validateWebhookUrl(input)
    expect(result.ok).toBe(false)
  })

  it.each([
    "http://127.0.0.1:3000/hook",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/hook",
    "http://10.0.0.5/hook",
    "http://localhost/hook",
    "http://metadata.google.internal/",
  ])("menolak alamat privat/lokal %s dengan pesan generik", async (url) => {
    const result = await validateWebhookUrl(url)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/alamat lokal\/privat diblokir/)
      expect(result.error).not.toMatch(/127\.0\.0\.1|169\.254|::1|10\.0\.0\.5/)
    }
  })

  it("menolak http di production sebelum resolve DNS", async () => {
    vi.stubEnv("NODE_ENV", "production")
    await expect(validateWebhookUrl("http://93.184.216.34/hook")).resolves.toEqual({
      ok: false,
      error: "URL webhook wajib menggunakan HTTPS.",
    })
  })
})
