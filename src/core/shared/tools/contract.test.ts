import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ResponseTooLargeError, SsrfBlockedError } from "@/lib/net/safe-fetch"
import {
  anySignal,
  failureFromError,
  failureFromHttpStatus,
  mapToolOutcome,
  toolFailure,
  toolOutcomeSchema,
  toolSuccess,
  withTimeout,
} from "./contract"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("toolFailure & schema", () => {
  it("retryable default mengikuti kode, dan bisa ditimpa", () => {
    expect(toolFailure("timeout", "x").retryable).toBe(true)
    expect(toolFailure("rate_limited", "x").retryable).toBe(true)
    expect(toolFailure("upstream_error", "x").retryable).toBe(true)
    expect(toolFailure("not_found", "x").retryable).toBe(false)
    expect(toolFailure("blocked_ssrf", "x").retryable).toBe(false)
    expect(toolFailure("upstream_error", "x", false).retryable).toBe(false)
  })

  it("toolOutcomeSchema memvalidasi sukses & gagal, menolak kode di luar daftar tertutup", () => {
    const schema = toolOutcomeSchema(z.object({ n: z.number() }))
    expect(schema.safeParse(toolSuccess({ n: 1 })).success).toBe(true)
    expect(schema.safeParse(toolFailure("not_found", "x")).success).toBe(true)
    expect(schema.safeParse({ ok: false, code: "kode_baru", message: "x", retryable: false }).success).toBe(false)
    expect(schema.safeParse({ ok: true, data: { n: "1" } }).success).toBe(false)
  })

  it("mapToolOutcome hanya mengubah data sukses", () => {
    expect(mapToolOutcome(toolSuccess(2), (n) => n * 2)).toEqual({ ok: true, data: 4 })
    const failure = toolFailure("timeout", "lambat")
    expect(mapToolOutcome(failure, (n: number) => n * 2)).toBe(failure)
  })
})

/** Pesan kegagalan selalu melewati sanitasi kontrak. */
const sanitizeToolMessage = (text: string) => toolFailure("upstream_error", text).message

describe("sanitasi pesan kegagalan", () => {
  it("meredaksi rahasia dan menyamarkan IP serta host SearXNG platform", () => {
    vi.stubEnv("SEARXNG_URL", "http://searxng-internal:8080")
    const message = sanitizeToolMessage(
      "GET https://api.test/x?api_key=sk-bocor-123456 dari 10.0.0.12 / [fd00::1] via searxng-internal:8080 Authorization: Bearer abc"
    )
    expect(message).not.toContain("sk-bocor-123456")
    expect(message).not.toContain("10.0.0.12")
    expect(message).not.toContain("fd00::1")
    expect(message).not.toContain("searxng-internal")
    expect(message).not.toContain("Bearer abc")
  })

  it("tidak merusak jam/teks biasa dan membatasi panjang", () => {
    expect(sanitizeToolMessage("Server sibuk pukul 10:30:00")).toBe("Server sibuk pukul 10:30:00")
    expect(sanitizeToolMessage("x".repeat(1000)).length).toBeLessThanOrEqual(300)
  })
})

describe("failureFromError", () => {
  it("sinyal pemanggil yang sudah abort → aborted, apa pun galatnya", () => {
    const controller = new AbortController()
    controller.abort()
    expect(failureFromError(new Error("fetch failed"), { signal: controller.signal })).toMatchObject({
      code: "aborted",
      retryable: false,
    })
  })

  it("SsrfBlockedError langsung maupun terbungkus cause undici → blocked_ssrf tanpa nama host", () => {
    expect(failureFromError(new SsrfBlockedError("Akses ke host internal diblokir."))).toMatchObject({
      code: "blocked_ssrf",
    })
    const wrapped = new TypeError("fetch failed", {
      cause: new SsrfBlockedError("Host db.corp.internal mengarah ke jaringan privat/lokal."),
    })
    const failure = failureFromError(wrapped)
    expect(failure).toMatchObject({ code: "blocked_ssrf", retryable: false })
    expect(failure.message).not.toContain("db.corp")
  })

  it("ResponseTooLargeError → too_large dengan label batas", () => {
    const failure = failureFromError(new ResponseTooLargeError(10), { sizeLimit: "3 MB" })
    expect(failure).toMatchObject({ code: "too_large", retryable: false })
    expect(failure.message).toContain("3 MB")
  })

  it.each([
    ["TimeoutError", new DOMException("The operation timed out.", "TimeoutError")],
    ["AbortError tanpa pembatalan run", new DOMException("This operation was aborted", "AbortError")],
  ])("%s → timeout (retryable)", (_label, err) => {
    expect(failureFromError(err)).toMatchObject({ code: "timeout", retryable: true })
  })

  it("galat jaringan undici → upstream_error dengan kode saja (tanpa alamat)", () => {
    const err = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:443"), { code: "ECONNREFUSED" }),
    })
    const failure = failureFromError(err)
    expect(failure).toMatchObject({ code: "upstream_error", retryable: true })
    expect(failure.message).toContain("ECONNREFUSED")
    expect(failure.message).not.toContain("10.1.2.3")
  })

  it("galat tak dikenal → upstream_error dengan pesan tersanitasi", () => {
    const failure = failureFromError(new Error("gagal GET https://x.test/?api_key=sk-rahasia-999 ke 192.168.1.5"))
    expect(failure.code).toBe("upstream_error")
    expect(failure.message).not.toContain("sk-rahasia-999")
    expect(failure.message).not.toContain("192.168.1.5")
    expect(failureFromError("bukan error").message).toMatch(/tak terduga/)
  })
})

describe("failureFromHttpStatus", () => {
  it.each([
    [400, false, "invalid_input", false],
    [401, true, "unauthorized", false],
    [403, false, "access_denied", false],
    [404, false, "not_found", false],
    [408, false, "timeout", true],
    [413, false, "too_large", false],
    [415, false, "unsupported_content", false],
    [429, false, "rate_limited", true],
    [503, false, "upstream_error", true],
    [409, false, "upstream_error", false],
  ])("HTTP %i (kredensial: %s) → %s (retryable %s)", (status, credentialed, code, retryable) => {
    expect(failureFromHttpStatus(status, "Server", { credentialed })).toMatchObject({ code, retryable })
  })

  it("rincian dari layanan tujuan ikut tersanitasi", () => {
    const failure = failureFromHttpStatus(401, "WordPress", { credentialed: true, detail: "lihat https://wp.test/?access_token=abcdef0123456789xyz" })
    expect(failure.message).toContain("WordPress merespons HTTP 401")
    expect(failure.message).not.toContain("abcdef0123456789xyz")
  })
})

describe("sinyal pembatalan", () => {
  it("anySignal: kosong → undefined, satu → sinyal itu sendiri, banyak → gabungan", () => {
    const a = new AbortController()
    const b = new AbortController()
    expect(anySignal(undefined, undefined)).toBeUndefined()
    expect(anySignal(a.signal, undefined)).toBe(a.signal)
    const combined = anySignal(a.signal, b.signal)
    expect(combined?.aborted).toBe(false)
    b.abort()
    expect(combined?.aborted).toBe(true)
  })

  it("withTimeout batal oleh sinyal run maupun oleh timeout", async () => {
    const run = new AbortController()
    const signal = withTimeout(run.signal, 10_000)
    run.abort()
    expect(signal.aborted).toBe(true)

    const timed = withTimeout(undefined, 10)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(timed.aborted).toBe(true)
    expect((timed.reason as Error).name).toBe("TimeoutError")
  })
})
