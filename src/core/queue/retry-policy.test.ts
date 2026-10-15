import { describe, expect, it } from "vitest"
import { ResponseTooLargeError, SsrfBlockedError } from "@/lib/net/safe-fetch"
import { describeWpNetworkError } from "@/lib/wordpress/client"
import {
  MAX_AUTO_ATTEMPTS,
  RETRY_BACKOFF_MS,
  RETRY_COUNT_LIMIT,
  clampRetryCount,
  classifyThrownError,
  classifyWordPressFailure,
  classifyWriterFailure,
  decideFailure,
  retryBackoffMs,
} from "@/core/queue/retry-policy"

const NOW = new Date("2026-10-15T10:00:00Z")

describe("retryBackoffMs", () => {
  it("1 menit, 5 menit, lalu 15 menit (dibatasi elemen terakhir)", () => {
    expect([1, 2, 3, 4, 10].map(retryBackoffMs)).toEqual([60_000, 300_000, 900_000, 900_000, 900_000])
    expect(retryBackoffMs(0)).toBe(RETRY_BACKOFF_MS[0])
  })
})

describe("decideFailure", () => {
  it("sementara: generasi diantrekan ulang ke queued_input dengan backoff", () => {
    expect(decideFailure({ stage: "generation", failure: "transient", retryCount: 0, now: NOW })).toEqual({
      state: "queued_input",
      retryCount: 1,
      nextAttemptAt: new Date("2026-10-15T10:01:00Z"),
      willRetry: true,
    })
    expect(decideFailure({ stage: "generation", failure: "transient", retryCount: 1, now: NOW })).toMatchObject({
      retryCount: 2,
      nextAttemptAt: new Date("2026-10-15T10:05:00Z"),
    })
  })

  it("sementara: sinkronisasi diantrekan ulang ke ready_to_sync (naskah tidak digenerasi ulang)", () => {
    expect(decideFailure({ stage: "sync", failure: "transient", retryCount: null, now: NOW })).toMatchObject({
      state: "ready_to_sync",
      retryCount: 1,
      willRetry: true,
    })
  })

  it("percobaan habis → dead-letter failed_* tanpa jadwal ulang", () => {
    for (const stage of ["generation", "sync"] as const) {
      const decision = decideFailure({ stage, failure: "transient", retryCount: MAX_AUTO_ATTEMPTS - 1, now: NOW })
      expect(decision).toEqual({
        state: stage === "sync" ? "failed_sync" : "failed_generation",
        retryCount: MAX_AUTO_ATTEMPTS,
        nextAttemptAt: null,
        willRetry: false,
      })
    }
  })

  it("permanen → failed_* langsung tanpa menambah retry_count", () => {
    expect(decideFailure({ stage: "generation", failure: "permanent", retryCount: 1, now: NOW })).toEqual({
      state: "failed_generation",
      retryCount: 1,
      nextAttemptAt: null,
      willRetry: false,
    })
  })
})

describe("clampRetryCount", () => {
  it("menormalkan nilai tersimpan agar +1 tetap dalam CHECK 0..1000", () => {
    expect(clampRetryCount(null)).toBe(0)
    expect(clampRetryCount(-5)).toBe(0)
    expect(clampRetryCount(2.7)).toBe(2)
    expect(clampRetryCount(Number.NaN)).toBe(0)
    expect(clampRetryCount(2147483647)).toBe(RETRY_COUNT_LIMIT - 1)
  })

  it("decideFailure dengan retry_count ekstrem → dead-letter tanpa melewati batas", () => {
    expect(decideFailure({ stage: "generation", failure: "transient", retryCount: 2147483647, now: NOW })).toMatchObject({
      state: "failed_generation",
      retryCount: RETRY_COUNT_LIMIT,
      willRetry: false,
    })
    expect(decideFailure({ stage: "sync", failure: "permanent", retryCount: 99999, now: NOW }).retryCount).toBe(
      RETRY_COUNT_LIMIT - 1
    )
  })
})

describe("classifyWriterFailure", () => {
  it("error non-retryable (kunci BYOK hilang, validasi) selalu permanen", () => {
    expect(classifyWriterFailure({ code: "MISSING_API_KEY", retryable: false }, "missing_api_key")).toBe("permanent")
    expect(classifyWriterFailure({ code: "INVALID_INPUT", retryable: false }, "failed_timeout_exceeded")).toBe("permanent")
  })

  it("LLM terputus/timeout sementara; batas loop/naskah pendek permanen", () => {
    expect(classifyWriterFailure({ retryable: true }, "failed_agent_loop_interrupted")).toBe("transient")
    expect(classifyWriterFailure({ retryable: true }, "failed_finalized_after_timeout_exceeded")).toBe("transient")
    expect(classifyWriterFailure({ retryable: true }, "failed_limit_reached")).toBe("permanent")
    expect(classifyWriterFailure(undefined, undefined)).toBe("permanent")
  })
})

describe("classifyThrownError", () => {
  it("SSRF & respons terlalu besar permanen; status HTTP 429/5xx sementara, 4xx permanen", () => {
    expect(classifyThrownError(new SsrfBlockedError("diblokir"))).toBe("permanent")
    expect(classifyThrownError(new ResponseTooLargeError(1024))).toBe("permanent")
    expect(classifyThrownError(Object.assign(new Error("rate"), { status: 429 }))).toBe("transient")
    expect(classifyThrownError(Object.assign(new Error("down"), { statusCode: 503 }))).toBe("transient")
    expect(classifyThrownError(Object.assign(new Error("unauthorized"), { status: 401 }))).toBe("permanent")
  })

  it("exception tak dikenal (DB/jaringan) sementara — dibatasi jumlah percobaan", () => {
    expect(classifyThrownError(new Error("DB putus"))).toBe("transient")
    expect(classifyThrownError("string")).toBe("transient")
  })
})

describe("classifyWordPressFailure", () => {
  it.each([
    ["Gagal membuat postingan (HTTP 429).", "transient"],
    ["Too Many Requests", "transient"],
    ["Gagal membuat postingan (HTTP 503).", "transient"],
    ["Kesalahan jaringan: getaddrinfo ENOTFOUND blog.test", "transient"],
    ["Kesalahan jaringan: connect ECONNREFUSED 1.2.3.4:443", "transient"],
    ["Pengiriman artikel ke WordPress timeout (melebihi 20 detik).", "uncertain"],
    ["Gagal membuat postingan (HTTP 502).", "uncertain"],
    ["Kesalahan jaringan: fetch failed", "uncertain"],
    ["Kesalahan jaringan: socket hang up", "uncertain"],
    ["Sorry, you are not allowed to create posts as this user.", "permanent"],
    ["URL website WordPress tidak valid.", "permanent"],
    [undefined, "permanent"],
    ["Kesalahan jaringan: fetch failed (UND_ERR_CONNECT_TIMEOUT)", "transient"],
  ] as const)("%s → %s", (message, expected) => {
    expect(classifyWordPressFailure(message)).toBe(expected)
  })

  it("TypeError undici asli (kode di err.cause) dari createWordPressPost dikenali sebagai sementara", () => {
    const refused = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED 203.0.113.9:443"), { code: "ECONNREFUSED" }),
    })
    const dns = new TypeError("fetch failed", { cause: { code: "EAI_AGAIN", hostname: "blog.test" } })
    const reset = new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })

    // Format pesan persis seperti catch createWordPressPost: "Kesalahan jaringan: <describeWpNetworkError>".
    const asWpError = (err: unknown) => `Kesalahan jaringan: ${describeWpNetworkError(err, "x")}`
    expect(classifyWordPressFailure(asWpError(refused))).toBe("transient")
    expect(classifyWordPressFailure(asWpError(dns))).toBe("transient")
    expect(classifyWordPressFailure(asWpError(reset))).toBe("uncertain")
  })
})
