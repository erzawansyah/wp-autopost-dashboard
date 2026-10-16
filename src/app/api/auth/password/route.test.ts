import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"
import { AuthSessionMissingError } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  calls: [] as string[],
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  verifierSignOut: vi.fn(),
}))

// Client sesi pengguna (cookie) — dipakai untuk updateUser & signOut({ scope: "others" }).
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        mocks.user ? { data: { user: mocks.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  }),
}))

// Client stateless terpisah — hanya untuk memverifikasi kata sandi lama.
vi.mock("@/lib/supabase/stateless", () => ({
  createStatelessClient: () => ({
    auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.verifierSignOut },
  }),
}))

import { POST } from "@/app/api/auth/password/route"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const ctx = { params: Promise.resolve({}) }
const USER_ID = "11111111-1111-4111-8111-111111111111"
const EMAIL = "pemilik@example.com"
const CURRENT = "sandi-lama-RAHASIA-1"
const NEXT = "sandi-baru-RAHASIA-2"

function emailUser(overrides: Record<string, unknown> = {}) {
  return { id: USER_ID, email: EMAIL, app_metadata: { provider: "email", providers: ["email"] }, ...overrides }
}

function changePassword(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx
  )
}

const validBody = { currentPassword: CURRENT, newPassword: NEXT }

let logSpies: MockInstance[] = []

/** Semua keluaran log console selama test (untuk memastikan kata sandi tidak pernah tercatat). */
function loggedText(): string {
  return logSpies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => args.map(String).join(" "))
    .join("\n")
}

beforeEach(() => {
  resetRateLimitStore()
  mocks.user = emailUser()
  mocks.calls = []
  for (const fn of [mocks.updateUser, mocks.signOut, mocks.signInWithPassword, mocks.verifierSignOut]) fn.mockReset()
  mocks.signInWithPassword.mockImplementation(async () => {
    mocks.calls.push("verify")
    return { data: { user: { id: USER_ID }, session: { access_token: "verifier-token" } }, error: null }
  })
  mocks.verifierSignOut.mockImplementation(async () => {
    mocks.calls.push("verifier-signout")
    return { error: null }
  })
  mocks.updateUser.mockImplementation(async () => {
    mocks.calls.push("update")
    return { data: { user: { id: USER_ID } }, error: null }
  })
  mocks.signOut.mockImplementation(async () => {
    mocks.calls.push("signout-others")
    return { error: null }
  })
  logSpies = (["warn", "error", "log"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
})

describe("POST /api/auth/password", () => {
  it("wajib sesi", async () => {
    mocks.user = null
    const res = await changePassword(validBody)
    expect(res.status).toBe(401)
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it.each([
    [{ currentPassword: "", newPassword: NEXT }, "currentPassword", "Kata sandi saat ini wajib diisi."],
    [{ currentPassword: CURRENT, newPassword: "12345" }, "newPassword", "Kata sandi minimal 6 karakter."],
    [{ currentPassword: CURRENT, newPassword: "x".repeat(73) }, "newPassword", "Kata sandi maksimal 72 karakter."],
    [{ currentPassword: CURRENT, newPassword: CURRENT }, "newPassword", "Kata sandi baru harus berbeda dari kata sandi saat ini."],
  ])("validasi body %j → 400 tanpa memanggil Supabase", async (body, path, message) => {
    const res = await changePassword(body)
    const raw = await res.text()
    expect(res.status).toBe(400)
    expect(JSON.parse(raw)).toMatchObject({ ok: false, code: "validation_failed", issues: [{ path, message }] })
    expect(raw).not.toContain(CURRENT)
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it("sukses: verifikasi kata sandi lama (stateless) → ganti via sesi → keluarkan sesi lain", async () => {
    const res = await changePassword(validBody)
    const raw = await res.text()

    expect(res.status).toBe(200)
    expect(JSON.parse(raw)).toEqual({
      ok: true,
      message: "Kata sandi berhasil diganti. Sesi di perangkat lain telah dikeluarkan.",
    })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: CURRENT })
    expect(mocks.verifierSignOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: NEXT })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" })
    expect(mocks.calls).toEqual(["verify", "verifier-signout", "update", "signout-others"])
    expect(raw).not.toContain(CURRENT)
    expect(raw).not.toContain(NEXT)
  })

  it("kata sandi lama salah → 400 pesan umum pada field currentPassword, tidak mengganti apa pun", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    })
    const res = await changePassword(validBody)
    const raw = await res.text()

    expect(res.status).toBe(400)
    expect(JSON.parse(raw)).toEqual({
      ok: false,
      code: "bad_request",
      error: "Kata sandi saat ini salah.",
      issues: [{ path: "currentPassword", message: "Kata sandi saat ini salah." }],
    })
    expect(raw).not.toContain("Invalid login credentials")
    expect(mocks.verifierSignOut).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it("penolakan verifikasi lain (mis. captcha) → pesan umum yang sama; log hanya kode, tanpa kata sandi", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "captcha_failed", status: 400, message: `captcha gagal untuk ${CURRENT}` },
    })
    const res = await changePassword(validBody)

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Kata sandi saat ini salah.")
    expect(loggedText()).toContain("captcha_failed")
    expect(loggedText()).not.toContain(CURRENT)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it("sesi verifikasi milik pengguna lain → ditolak dan sesi verifikasi tetap diakhiri", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "22222222-2222-4222-8222-222222222222" }, session: { access_token: "x" } },
      error: null,
    })
    const res = await changePassword(validBody)

    expect(res.status).toBe(400)
    expect(mocks.verifierSignOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it.each([
    [{ status: 429, code: "over_request_rate_limit" }, 429, "rate_limited"],
    [{ status: 503 }, 502, "upstream_failed"],
    [{ status: 0 }, 502, "upstream_failed"],
  ])("verifikasi gagal sementara %j → %i", async (error, status, code) => {
    mocks.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null }, error })
    const res = await changePassword(validBody)
    expect(res.status).toBe(status)
    expect((await res.json()).code).toBe(code)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: "same_password", status: 422 }, 400, "newPassword", "Kata sandi baru harus berbeda dari kata sandi saat ini."],
    [
      { code: "weak_password", status: 422, reasons: ["pwned"] },
      400,
      "newPassword",
      "Kata sandi baru ini pernah bocor di internet. Pilih kata sandi lain.",
    ],
    [
      { code: "weak_password", status: 422, reasons: ["characters"] },
      400,
      "newPassword",
      "Kata sandi baru belum memenuhi syarat karakter. Gunakan kombinasi huruf besar, huruf kecil, angka, dan simbol.",
    ],
  ])("error updateUser %j → %i pada field %s", async (error, status, path, message) => {
    mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { ...error, message: "English detail" } })
    const res = await changePassword(validBody)
    const body = await res.json()

    expect(res.status).toBe(status)
    expect(body).toMatchObject({ ok: false, error: message, issues: [{ path, message }] })
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it("reauthentication_needed (secure_password_change aktif) → 403 dengan arahan masuk ulang", async () => {
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "reauthentication_needed", status: 400, message: "Password update requires reauthentication" },
    })
    const res = await changePassword(validBody)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body).toEqual({
      ok: false,
      code: "forbidden",
      error: "Demi keamanan, keluar lalu masuk kembali ke akun Anda sebelum mengganti kata sandi.",
    })
  })

  it("sesi hilang saat updateUser → 401", async () => {
    mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthSessionMissingError() })
    const res = await changePassword(validBody)
    expect(res.status).toBe(401)
  })

  it("pencabutan sesi lain gagal → kata sandi tetap berganti (200) tanpa klaim sesi lain dikeluarkan", async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { status: 500, message: "boom" } })
    const res = await changePassword(validBody)

    expect(res.status).toBe(200)
    expect((await res.json()).message).toBe("Kata sandi berhasil diganti.")
    expect(loggedText()).not.toContain(NEXT)
  })

  it("akun khusus penyedia eksternal (tanpa kata sandi) → 400 tanpa verifikasi", async () => {
    mocks.user = emailUser({ app_metadata: { provider: "google", providers: ["google"] } })
    const res = await changePassword(validBody)

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("penyedia eksternal")
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it("rate limit ketat per pengguna (5 percobaan / 15 menit) → 429 sebelum menyentuh Supabase", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    })
    for (let i = 0; i < 5; i++) expect((await changePassword(validBody)).status).toBe(400)

    const res = await changePassword(validBody)
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(5)
  })
})
