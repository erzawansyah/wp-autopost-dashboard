import { afterEach, describe, expect, it, vi } from "vitest"
import { ResponseTooLargeError, SsrfBlockedError } from "@/lib/net/safe-fetch"
import {
  readWpErrorCode,
  recordObservedSiteHealth,
  SITE_HEALTH_REFRESH_MS,
  shouldRecordSiteHealth,
  siteHealthFromError,
  siteHealthFromResponse,
  type ObservedSite,
} from "@/lib/wordpress/site-health"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("siteHealthFromResponse", () => {
  it.each([200, 201, 204])("HTTP %i → connected", (status) => {
    expect(siteHealthFromResponse(status)).toBe("connected")
  })

  it("401 selalu auth_error (WordPress: tidak ada user terautentikasi), apa pun kodenya", () => {
    expect(siteHealthFromResponse(401)).toBe("auth_error")
    expect(siteHealthFromResponse(401, "incorrect_password")).toBe("auth_error")
    expect(siteHealthFromResponse(401, "rest_cannot_create")).toBe("auth_error")
  })

  it.each([
    "incorrect_password",
    "invalid_username",
    "invalid_email",
    "application_passwords_disabled",
    "application_passwords_disabled_for_user",
    "rest_not_logged_in",
  ])("403 dengan kode kredensial %s → auth_error", (code) => {
    expect(siteHealthFromResponse(403, code)).toBe("auth_error")
  })

  it.each(["rest_cannot_create", "rest_cannot_publish", "rest_cannot_assign_term", "rest_forbidden", undefined])(
    "403 karena kapabilitas/role atau WAF tanpa kode WordPress (%s) → tidak mengubah status",
    (code) => {
      expect(siteHealthFromResponse(403, code)).toBeNull()
    }
  )

  it("429 → rate_limited", () => {
    expect(siteHealthFromResponse(429)).toBe("rate_limited")
    expect(siteHealthFromResponse(429, "too_many_requests")).toBe("rate_limited")
  })

  it.each([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530])("HTTP %i (gateway/origin) → unreachable", (status) => {
    expect(siteHealthFromResponse(status)).toBe("unreachable")
  })

  it.each([400, 404, 405, 409, 413, 500, 501])("HTTP %i → tidak mengubah status", (status) => {
    expect(siteHealthFromResponse(status, "rest_invalid_param")).toBeNull()
  })
})

describe("readWpErrorCode", () => {
  it("membaca code WP_Error hanya bila berupa string", () => {
    expect(readWpErrorCode({ code: "incorrect_password", message: "x", data: { status: 401 } })).toBe("incorrect_password")
    expect(readWpErrorCode({ code: 401 })).toBeUndefined()
    expect(readWpErrorCode(null)).toBeUndefined()
    expect(readWpErrorCode("<html>")).toBeUndefined()
    expect(readWpErrorCode([{ code: "x" }])).toBeUndefined()
  })
})

describe("siteHealthFromError", () => {
  const fetchFailed = (cause: unknown) => new TypeError("fetch failed", { cause })

  it.each([
    ["DNS tidak ditemukan", fetchFailed(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }))],
    ["DNS sementara", fetchFailed({ code: "EAI_AGAIN" })],
    ["koneksi ditolak", fetchFailed({ code: "ECONNREFUSED" })],
    ["koneksi putus", fetchFailed({ code: "ECONNRESET" })],
    ["timeout connect undici", fetchFailed({ code: "UND_ERR_CONNECT_TIMEOUT" })],
    ["sertifikat kedaluwarsa", fetchFailed({ code: "CERT_HAS_EXPIRED" })],
    ["sertifikat self-signed", fetchFailed({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" })],
    ["nama host TLS tidak cocok", fetchFailed({ code: "ERR_TLS_CERT_ALTNAME_INVALID" })],
    ["fetch failed tanpa kode", new TypeError("fetch failed")],
    ["body terputus", new TypeError("terminated", { cause: { code: "UND_ERR_SOCKET" } })],
    ["timeout request", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
    ["host privat/redirect diblokir safeFetch", new SsrfBlockedError("Terlalu banyak redirect (maks 0).")],
    ["DNS ke alamat privat (dibungkus undici)", fetchFailed(new SsrfBlockedError("Host x mengarah ke jaringan privat/lokal."))],
  ])("%s → unreachable", (_label, err) => {
    expect(siteHealthFromError(err)).toBe("unreachable")
  })

  it.each([
    ["dibatalkan pemanggil", new DOMException("This operation was aborted", "AbortError")],
    ["alasan abort kustom (klaim antrean)", Object.assign(new Error("lease hilang"), { name: "ClaimAbortedError", code: "lease_lost" })],
    ["respons terlalu besar", new ResponseTooLargeError(10)],
    ["JSON rusak", new SyntaxError("Unexpected token < in JSON")],
    ["bug pemanggil", Object.assign(new TypeError("Invalid header"), { code: "ERR_INVALID_ARG_VALUE" })],
    ["abort undici", new Error("aborted", { cause: { code: "UND_ERR_ABORTED" } })],
    ["bukan error", "gagal"],
    ["null", null],
  ])("%s → tidak mengubah status", (_label, err) => {
    expect(siteHealthFromError(err)).toBeNull()
  })
})

describe("shouldRecordSiteHealth", () => {
  const now = new Date("2026-10-16T10:00:00.000Z")

  it("menulis bila status berubah", () => {
    expect(shouldRecordSiteHealth({ status: "connected", last_checked_at: now.toISOString() }, "auth_error", now)).toBe(true)
    expect(shouldRecordSiteHealth({ status: "unreachable", last_checked_at: now.toISOString() }, "connected", now)).toBe(true)
  })

  it("status sama: hanya menyegarkan last_checked_at yang kosong/tidak valid/lebih tua dari jeda", () => {
    const fresh = new Date(now.getTime() - SITE_HEALTH_REFRESH_MS + 1_000).toISOString()
    const stale = new Date(now.getTime() - SITE_HEALTH_REFRESH_MS).toISOString()
    expect(shouldRecordSiteHealth({ status: "connected", last_checked_at: fresh }, "connected", now)).toBe(false)
    expect(shouldRecordSiteHealth({ status: "connected", last_checked_at: stale }, "connected", now)).toBe(true)
    expect(shouldRecordSiteHealth({ status: "connected", last_checked_at: null }, "connected", now)).toBe(true)
    expect(shouldRecordSiteHealth({ status: "connected", last_checked_at: "bukan-tanggal" }, "connected", now)).toBe(true)
  })
})

describe("recordObservedSiteHealth", () => {
  type Filter = [string, unknown]
  const now = new Date("2026-10-16T10:00:00.000Z")
  const site: ObservedSite = {
    id: "site-1",
    status: "connected",
    last_checked_at: "2026-10-16T09:59:00.000Z",
    updated_at: "2026-10-16T09:59:00.123456+00:00",
  }

  function fakeSupabase(result: { error: { code?: string; message: string } | null } | Error) {
    const calls: Array<{ table: string; payload: unknown; filters: Filter[] }> = []
    const client = {
      from(table: string) {
        const call = { table, payload: undefined as unknown, filters: [] as Filter[] }
        calls.push(call)
        const builder = {
          update(payload: unknown) {
            call.payload = payload
            return builder
          },
          eq(column: string, value: unknown) {
            call.filters.push([column, value])
            return builder
          },
          then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            const settled = result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
            return settled.then(onFulfilled, onRejected)
          },
        }
        return builder
      },
    }
    return { client: client as unknown as Parameters<typeof recordObservedSiteHealth>[0], calls }
  }

  it("status berubah → satu UPDATE berfilter id + user_id + pagar updated_at", async () => {
    const { client, calls } = fakeSupabase({ error: null })
    const written = await recordObservedSiteHealth(client, { userId: "user-1", site, observed: "auth_error", now })

    expect(written).toBe(true)
    expect(calls).toEqual([
      {
        table: "wp_sites",
        payload: { status: "auth_error", last_checked_at: now.toISOString() },
        filters: [
          ["id", "site-1"],
          ["user_id", "user-1"],
          ["updated_at", site.updated_at],
        ],
      },
    ])
  })

  it("tanpa observasi atau status sama & masih segar → tidak ada query (hemat tulis)", async () => {
    const { client, calls } = fakeSupabase({ error: null })
    expect(await recordObservedSiteHealth(client, { userId: "user-1", site, observed: null, now })).toBe(false)
    expect(await recordObservedSiteHealth(client, { userId: "user-1", site, observed: undefined, now })).toBe(false)
    expect(await recordObservedSiteHealth(client, { userId: "user-1", site, observed: "connected", now })).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("baris tanpa updated_at tetap ditulis dengan filter pemilik", async () => {
    const { client, calls } = fakeSupabase({ error: null })
    await recordObservedSiteHealth(client, { userId: "user-1", site: { ...site, updated_at: null }, observed: "unreachable", now })
    expect(calls[0].filters).toEqual([
      ["id", "site-1"],
      ["user_id", "user-1"],
    ])
  })

  it("error DB atau exception tidak pernah dilempar; log tanpa pesan DB", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const dbError = fakeSupabase({ error: { code: "42501", message: "detail internal rahasia" } })
    await expect(recordObservedSiteHealth(dbError.client, { userId: "user-1", site, observed: "rate_limited", now })).resolves.toBe(false)

    const thrown = fakeSupabase(new Error("koneksi DB putus: postgres://user:pass@host"))
    await expect(recordObservedSiteHealth(thrown.client, { userId: "user-1", site, observed: "rate_limited", now })).resolves.toBe(false)

    const logged = warn.mock.calls.flat().map(String).join("\n")
    expect(logged).toContain("site-1")
    expect(logged).toContain("42501")
    expect(logged).not.toContain("detail internal rahasia")
    expect(logged).not.toContain("postgres://")
  })
})
