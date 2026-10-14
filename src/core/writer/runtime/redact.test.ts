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
    const result = redactSecrets({ error: new Error("gagal: ?token=abc123") }) as {
      error: { name: string; message: string }
    }
    expect(result.error).toEqual({ name: "Error", message: `gagal: ?token=${REDACTED}` })
  })
})

describe("redactRecord", () => {
  it("selalu mengembalikan record", () => {
    expect(redactRecord({ password: "x", ok: true })).toEqual({ password: REDACTED, ok: true })
  })
})
