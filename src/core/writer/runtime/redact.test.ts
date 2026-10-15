import { describe, expect, it } from "vitest"
import {
  REDACTED,
  isSensitiveKey,
  redactRecord,
  redactSecrets,
  redactSecretsInText,
} from "./redact"

describe("isSensitiveKey", () => {
  it.each([
    "applicationPassword",
    "password",
    "apiKey",
    "api_key",
    "openrouterKey",
    "langsmithApiKey",
    "clientSecret",
    "accessToken",
    "token",
    "Authorization",
    "encrypted_app_password",
    "wpCredentials",
    "auth",
    "set-cookie",
  ])("menandai '%s' sebagai rahasia", (key) => {
    expect(isSensitiveKey(key)).toBe(true)
  })

  it.each([
    "keyword",
    "keyPoints",
    "author",
    "authorId",
    "autoAssignAuthor",
    "maxTokens",
    "tokens",
    "baseUrl",
    "username",
    "title",
    "primaryKey",
    "cache_key",
    "idempotencyKey",
    "publicKey",
  ])("tidak menandai '%s'", (key) => {
    expect(isSensitiveKey(key)).toBe(false)
  })
})

describe("redactSecrets", () => {
  it("menyamarkan kredensial bersarang tanpa memutasi input", () => {
    const input = {
      keyword: "tips wordpress",
      apiKey: "sk-or-v1-abcdef0123456789",
      site: {
        baseUrl: "https://contoh.id",
        username: "editor",
        applicationPassword: "abcd efgh ijkl mnop",
      },
      userKeys: { tavilyKey: "tvly-123", braveKey: "", serpapiKey: undefined },
      headers: [{ Authorization: "Basic ZWRpdG9yOnNlY3JldA==" }],
    }
    const snapshot = structuredClone(input)

    const result = redactSecrets(input) as typeof input

    expect(result.keyword).toBe("tips wordpress")
    expect(result.apiKey).toBe(REDACTED)
    expect(result.site.baseUrl).toBe("https://contoh.id")
    expect(result.site.username).toBe("editor")
    expect(result.site.applicationPassword).toBe(REDACTED)
    expect(result.userKeys.tavilyKey).toBe(REDACTED)
    expect(result.userKeys.braveKey).toBe("")
    expect(result.userKeys.serpapiKey).toBeUndefined()
    expect(result.headers[0].Authorization).toBe(REDACTED)
    expect(input).toEqual(snapshot)

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("sk-or-v1-abcdef0123456789")
    expect(serialized).not.toContain("abcd efgh ijkl mnop")
    expect(serialized).not.toContain("tvly-123")
  })

  it("menyamarkan rahasia di dalam teks bebas", () => {
    expect(redactSecretsInText("GET https://serpapi.com/search.json?q=a&api_key=SECRET123&hl=id")).toBe(
      `GET https://serpapi.com/search.json?q=a&api_key=${REDACTED}&hl=id`,
    )
    expect(redactSecretsInText("Authorization: Bearer abcdefghijklmnop")).toBe(
      `Authorization: Bearer ${REDACTED}`,
    )
    expect(redactSecretsInText("Tidak ada rahasia di sini")).toBe("Tidak ada rahasia di sini")
  })

  it("membuang fungsi dan aman terhadap referensi sirkular", () => {
    const node: Record<string, unknown> = { name: "root", onEventListener: () => undefined }
    node.self = node
    const shared = { value: 1 }

    const result = redactSecrets({ node, a: shared, b: shared }) as Record<string, Record<string, unknown>>

    expect(result.node.name).toBe("root")
    expect("onEventListener" in result.node).toBe(false)
    expect(result.node.self).toBe("[Circular]")
    expect(result.a).toEqual({ value: 1 })
    expect(result.b).toEqual({ value: 1 })
  })

  it("menyaring pesan Error", () => {
    // Sebelumnya `?token=abc123` (pendek) ikut disamarkan; kini `token=` generik hanya disamarkan
    // bila nilainya menyerupai kredensial (>= 16 karakter dan memuat angka) agar URL gambar tidak rusak.
    const result = redactSecrets({ error: new Error("gagal: ?token=tk_9f8e7d6c5b4a3f2e1d") }) as {
      error: { name: string; message: string }
    }
    expect(result.error).toEqual({ name: "Error", message: `gagal: ?token=${REDACTED}` })
  })

  it("scanText: false hanya menyamarkan properti rahasia tanpa mengubah teks/URL lain", () => {
    const output = {
      title: "Basic Training: Authorization: Bearer abc",
      imageUrl: "https://cdn.contoh.com/a.jpg?token=tk_9f8e7d6c5b4a3f2e1d",
      apiKey: "sk-or-v1-abcdef0123456789",
    }

    const result = redactSecrets(output, { scanText: false }) as typeof output

    expect(result.title).toBe(output.title)
    expect(result.imageUrl).toBe(output.imageUrl)
    expect(result.apiKey).toBe(REDACTED)
  })
})

describe("redactSecretsInText — pola sempit (tidak merusak konten)", () => {
  it.each([
    "Basic Training untuk pemula",
    "BASIC Training 2024",
    "Bearer of bad news",
    "Authorization header wajib diisi",
    "https://images.contoh.com/foto.jpg?token=abc123&w=800",
    "https://contoh.com/?key=homepage-hero-banner",
  ])("tidak mengubah teks biasa: %j", (text) => {
    expect(redactSecretsInText(text)).toBe(text)
  })

  it("selalu menyamarkan nilai field Authorization (dengan/tanpa skema)", () => {
    expect(redactSecretsInText('{"Authorization":"Basic ZWRpdG9yOnNlY3JldA=="}')).toBe(
      `{"Authorization":"Basic ${REDACTED}"}`,
    )
    expect(redactSecretsInText("authorization=rahasia")).toBe(`authorization=${REDACTED}`)
  })

  it("menyamarkan token Bearer/Basic tanpa prefiks header bila menyerupai kredensial", () => {
    expect(redactSecretsInText("pakai Bearer sk-or-v1-0123456789abcdef")).toBe(`pakai Bearer ${REDACTED}`)
    expect(redactSecretsInText("kredensial Basic ZWRpdG9yOnNlY3JldDEyMw==")).toBe(`kredensial Basic ${REDACTED}`)
  })

  it("menyamarkan parameter query rahasia; key/token generik hanya bila panjang", () => {
    expect(redactSecretsInText("https://x.test/?apikey=abc&q=1")).toBe(`https://x.test/?apikey=${REDACTED}&q=1`)
    expect(redactSecretsInText("https://x.test/?access_token=abc")).toBe(`https://x.test/?access_token=${REDACTED}`)
    expect(redactSecretsInText("https://x.test/?key=AIzaSyA1b2C3d4E5f6G7h8")).toBe(`https://x.test/?key=${REDACTED}`)
    expect(redactSecretsInText("https://x.test/?a=1&token=0123456789abcdefXYZ#top")).toBe(
      `https://x.test/?a=1&token=${REDACTED}#top`,
    )
  })
})

describe("redactRecord", () => {
  it("selalu mengembalikan record", () => {
    expect(redactRecord({ password: "x", ok: true })).toEqual({ password: REDACTED, ok: true })
  })
})
