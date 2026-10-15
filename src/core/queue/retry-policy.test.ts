import { describe, expect, it } from "vitest"
import { ResponseTooLargeError, SsrfBlockedError } from "@/lib/net/safe-fetch"
import {
  MAX_AUTO_ATTEMPTS,
  RETRY_BACKOFF_MS,
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
  ] as const)("%s → %s", (message, expected) => {
    expect(classifyWordPressFailure(message)).toBe(expected)
  })
})
