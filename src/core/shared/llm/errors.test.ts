import { describe, expect, it } from "vitest"
import { OpenRouterError } from "@langchain/openrouter"
import { classifyLlmError, describeLlmError, LlmCallError, throwUnlessRetryable } from "./errors"

function httpError(status: number, message = `HTTP ${status}`, code?: string) {
  // `code` OpenRouter bisa berupa string (mis. "insufficient_quota") walau tipe konstruktornya number.
  return Object.assign(new OpenRouterError(message, status), code ? { code } : {})
}

function networkError(code: string) {
  return new TypeError("fetch failed", { cause: Object.assign(new Error("socket"), { code }) })
}

describe("classifyLlmError", () => {
  it.each([
    ["401 kunci ditolak", httpError(401), "auth", false, false],
    ["403 dilarang", httpError(403), "auth", false, false],
    ["402 kredit habis", httpError(402, "Insufficient credits"), "quota", false, false],
    ["429 kuota habis", httpError(429, "quota exceeded", "insufficient_quota"), "quota", false, false],
    ["429 rate limit", httpError(429, "Rate limit exceeded"), "rate_limit", true, true],
    ["400 request tidak valid", httpError(400, "Invalid request"), "bad_request", false, false],
    ["400 model tidak valid", httpError(400, "foo/bar is not a valid model ID"), "model_unavailable", false, true],
    ["404 tanpa endpoint", httpError(404, "No endpoints found for foo/bar"), "model_unavailable", false, true],
    ["500", httpError(500), "server", true, true],
    ["502", httpError(502), "server", true, true],
    ["503", httpError(503), "server", true, true],
    ["504", httpError(504), "timeout", true, true],
    ["408", httpError(408), "timeout", true, true],
    ["respons tanpa choices", new OpenRouterError("No choices returned in response."), "server", true, true],
    ["ECONNRESET", networkError("ECONNRESET"), "network", true, true],
    ["connect timeout undici", networkError("UND_ERR_CONNECT_TIMEOUT"), "timeout", true, true],
    ["AbortError run", new DOMException("aborted", "AbortError"), "aborted", false, false],
    ["deadline AbortSignal.timeout", new DOMException("signal timed out", "TimeoutError"), "aborted", false, false],
    ["LlmCallError", new LlmCallError("JSON rusak", { kind: "invalid_output" }), "invalid_output", false, false],
    ["nilai non-error", "boom", "unknown", false, false],
  ])("%s → %s", (_label, err, kind, retryable, fallbackable) => {
    expect(classifyLlmError(err)).toMatchObject({ kind, retryable, fallbackable })
  })

  it("batas harian model gratis OpenRouter (429 free-models-per-day, di pesan atau metadata) = kuota", () => {
    expect(classifyLlmError(httpError(429, "Rate limit exceeded: free-models-per-day. Add 10 credits"))).toMatchObject({
      kind: "quota",
      retryable: false,
      fallbackable: false,
    })
    const viaMetadata = Object.assign(new OpenRouterError("Rate limit exceeded", 429), {
      metadata: { reason: "free-models-per-day", headers: { "X-RateLimit-Remaining": "0" } },
    })
    expect(classifyLlmError(viaMetadata).kind).toBe("quota")
    expect(classifyLlmError(httpError(429, "Rate limit exceeded: free-models-per-min.")).kind).toBe("rate_limit")
  })

  it("membuka pembungkus MiddlewareError LangChain (berlapis) sampai error OpenRouter asli", () => {
    const wrap = (inner: Error) =>
      Object.assign(new Error(inner.message), { name: inner.name, cause: inner, "~brand": "MiddlewareError" })
    expect(classifyLlmError(wrap(wrap(httpError(401))))).toMatchObject({ kind: "auth", status: 401, retryable: false })
    // Deep Agent: satu lapis per middleware wrapModelCall (stack produksi ≥ 7 lapis).
    let deep: Error = httpError(402, "Insufficient credits")
    for (let layer = 0; layer < 10; layer++) deep = wrap(deep)
    expect(classifyLlmError(deep)).toMatchObject({ kind: "quota", status: 402, fallbackable: false })
    expect(classifyLlmError(wrap(wrap(httpError(402, "Insufficient credits"))))).toMatchObject({ kind: "quota", status: 402 })
    expect(classifyLlmError(wrap(httpError(403)))).toMatchObject({ kind: "auth", status: 403 })
    expect(classifyLlmError(wrap(httpError(503)))).toMatchObject({ kind: "server", retryable: true })
    // Error asing yang tidak dikenali diklasifikasi dari rantai `cause` (berbatas kedalaman, aman dari siklus).
    expect(classifyLlmError(new Error("tool gagal", { cause: httpError(402, "Insufficient credits") })).kind).toBe("quota")
    const cyclic: Error & { cause?: unknown } = new Error("siklus")
    cyclic.cause = cyclic
    expect(classifyLlmError(cyclic).kind).toBe("unknown")
  })

  it("membaca status dari `status` maupun `response.status`", () => {
    expect(classifyLlmError({ status: 503, message: "x" }).kind).toBe("server")
    expect(classifyLlmError({ response: { status: 401 }, message: "x" }).kind).toBe("auth")
  })
})

describe("throwUnlessRetryable (onFailedAttempt AsyncCaller)", () => {
  it("melempar ulang error non-transien agar tidak di-retry", () => {
    const unauthorized = httpError(401)
    expect(() => throwUnlessRetryable(unauthorized)).toThrow(unauthorized)
    expect(() => throwUnlessRetryable(httpError(400))).toThrow()
    expect(() => throwUnlessRetryable(new DOMException("aborted", "AbortError"))).toThrow()
  })

  it("membiarkan error transien (429/5xx/jaringan) untuk di-retry", () => {
    expect(() => throwUnlessRetryable(httpError(429))).not.toThrow()
    expect(() => throwUnlessRetryable(httpError(503))).not.toThrow()
    expect(() => throwUnlessRetryable(networkError("ECONNRESET"))).not.toThrow()
  })
})

describe("describeLlmError", () => {
  it("hanya jenis + status, tanpa isi pesan upstream", () => {
    expect(describeLlmError(httpError(503, "upstream trace xyz"))).toBe("server (HTTP 503)")
    expect(describeLlmError(networkError("ECONNRESET"))).toBe("network")
  })
})
