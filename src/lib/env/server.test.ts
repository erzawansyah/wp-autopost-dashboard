import { afterEach, describe, expect, it, vi } from "vitest"
import {
  checkServerEnvOnStartup,
  CRON_SECRET_MIN_LENGTH,
  formatServerEnvReport,
  serverEnv,
  validateServerEnv,
  type ServerEnvInput,
  type ServerEnvReport,
} from "./server"

// Nilai uji palsu (bukan secret nyata) yang tidak boleh pernah muncul di pesan validasi.
const SERVICE_KEY = "test-service-role-value-1111"
const ALT_SERVICE_KEY = "test-service-role-value-2222"
const PUBLISHABLE_KEY = "test-publishable-value-3333"
const MASTER_KEY = "ab".repeat(32)
const CRON = "c".repeat(CRON_SECRET_MIN_LENGTH)

function validSource(overrides: ServerEnvInput = {}): ServerEnvInput {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: "https://panitera.example",
    SUPABASE_SECRET_KEY: SERVICE_KEY,
    ENCRYPTION_MASTER_KEY: MASTER_KEY,
    CRON_SECRET: CRON,
    ...overrides,
  }
}

const variables = (issues: ServerEnvReport["errors"]) => issues.map((issue) => issue.variable)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("serverEnv", () => {
  it("menormalkan string kosong menjadi undefined dan flag hanya true untuk 'true'", () => {
    const env = serverEnv({
      OPENROUTER_DEFAULT_MODEL: "",
      PLATFORM_KEY_ALLOWED: "TRUE",
      ALLOW_PRIVATE_NETWORK_FETCH: "true",
    })
    expect(env.OPENROUTER_DEFAULT_MODEL).toBeUndefined()
    expect(env.PLATFORM_KEY_ALLOWED).toBe(false)
    expect(env.ALLOW_PRIVATE_NETWORK_FETCH).toBe(true)
    expect(env.isProduction).toBe(false)
    expect(serverEnv({ NODE_ENV: "production" }).isProduction).toBe(true)
  })

  it("mempertahankan nilai mentah tanpa trim (validasi tetap milik pemakai)", () => {
    expect(serverEnv({ OPENROUTER_API_KEY: ' "kunci" ' }).OPENROUTER_API_KEY).toBe(' "kunci" ')
  })

  it("SUPABASE_SECRET_KEY diutamakan, SUPABASE_SERVICE_ROLE_KEY menjadi alias cadangan", () => {
    expect(serverEnv({ SUPABASE_SECRET_KEY: SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY: ALT_SERVICE_KEY }).supabaseServiceRoleKey).toBe(
      SERVICE_KEY
    )
    expect(serverEnv({ SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: ALT_SERVICE_KEY }).supabaseServiceRoleKey).toBe(
      ALT_SERVICE_KEY
    )
    expect(serverEnv({}).supabaseServiceRoleKey).toBeUndefined()
  })

  it("membaca process.env secara lazy di setiap pemanggilan", () => {
    vi.stubEnv("CRON_SECRET", "nilai-pertama")
    expect(serverEnv().CRON_SECRET).toBe("nilai-pertama")
    vi.stubEnv("CRON_SECRET", "nilai-kedua")
    expect(serverEnv().CRON_SECRET).toBe("nilai-kedua")
    vi.stubEnv("CRON_SECRET", undefined)
    expect(serverEnv().CRON_SECRET).toBeUndefined()
  })
})

describe("validateServerEnv", () => {
  it("konfigurasi production lengkap lolos tanpa error maupun peringatan", () => {
    const report = validateServerEnv(validSource())
    expect(report).toEqual({ isProduction: true, errors: [], warnings: [] })
  })

  it("production: variabel inti yang hilang menjadi error", () => {
    const report = validateServerEnv({ NODE_ENV: "production" })
    expect(variables(report.errors)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY",
      "ENCRYPTION_MASTER_KEY",
      "CRON_SECRET",
    ])
    expect(variables(report.warnings)).toEqual(["NEXT_PUBLIC_APP_URL"])
  })

  it("development: masalah yang sama hanya menjadi peringatan", () => {
    const report = validateServerEnv({ NODE_ENV: "development" })
    expect(report.isProduction).toBe(false)
    expect(report.errors).toEqual([])
    expect(variables(report.warnings)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY",
      "ENCRYPTION_MASTER_KEY",
      "CRON_SECRET",
    ])
  })

  it("menerima alias lama SUPABASE_SERVICE_ROLE_KEY dan NEXT_PUBLIC_SUPABASE_ANON_KEY", () => {
    const report = validateServerEnv(
      validSource({
        SUPABASE_SECRET_KEY: undefined,
        SUPABASE_SERVICE_ROLE_KEY: ALT_SERVICE_KEY,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE_KEY,
      })
    )
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it("memperingatkan bila kedua alias service key berbeda nilai", () => {
    const report = validateServerEnv(validSource({ SUPABASE_SERVICE_ROLE_KEY: ALT_SERVICE_KEY }))
    expect(report.errors).toEqual([])
    expect(variables(report.warnings)).toEqual(["SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY"])
  })

  it.each([
    ["ENCRYPTION_MASTER_KEY", "bukan-hex-".repeat(7)],
    ["ENCRYPTION_MASTER_KEY", "ab".repeat(31)],
    ["NEXT_PUBLIC_SUPABASE_URL", "project-ref.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", "ftp://project-ref.supabase.co"],
    ["SEARXNG_URL", "searxng-internal:8080"],
    ["NEXT_PUBLIC_APP_URL", "bukan url"],
  ] as const)("production: %s dengan format tidak valid menjadi error", (name, value) => {
    const report = validateServerEnv(validSource({ [name]: value }))
    expect(variables(report.errors)).toEqual([name])
  })

  it("CRON_SECRET pendek hanya peringatan; berisi spasi saja dianggap kosong", () => {
    const short = validateServerEnv(validSource({ CRON_SECRET: "pendek" }))
    expect(short.errors).toEqual([])
    expect(variables(short.warnings)).toEqual(["CRON_SECRET"])

    const blank = validateServerEnv(validSource({ CRON_SECRET: "   " }))
    expect(variables(blank.errors)).toEqual(["CRON_SECRET"])
  })

  it("memperingatkan flag bernilai aneh dan ALLOW_PRIVATE_NETWORK_FETCH di production", () => {
    const report = validateServerEnv(
      validSource({ PLATFORM_KEY_ALLOWED: "1", ALLOW_PRIVATE_NETWORK_FETCH: "true" })
    )
    expect(report.errors).toEqual([])
    expect(variables(report.warnings)).toEqual(["PLATFORM_KEY_ALLOWED", "ALLOW_PRIVATE_NETWORK_FETCH"])
  })

  it("memperingatkan kunci platform yang diabaikan (BYOK-only) dan flag tanpa kunci", () => {
    const ignored = validateServerEnv(validSource({ OPENROUTER_API_KEY: "kunci-platform-uji", BING_API_KEY: "kunci-bing-uji" }))
    expect(variables(ignored.warnings)).toEqual(["OPENROUTER_API_KEY / BING_API_KEY"])

    const noKeys = validateServerEnv(validSource({ PLATFORM_KEY_ALLOWED: "true" }))
    expect(variables(noKeys.warnings)).toEqual(["PLATFORM_KEY_ALLOWED"])

    const allowed = validateServerEnv(validSource({ PLATFORM_KEY_ALLOWED: "true", PEXAFY_API_KEY: "kunci-pexafy-uji" }))
    expect(allowed.warnings).toEqual([])
  })

  it("membaca process.env bila sumber tidak diberikan", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY)
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined)
    vi.stubEnv("SUPABASE_SECRET_KEY", SERVICE_KEY)
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined)
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "zz")
    vi.stubEnv("CRON_SECRET", CRON)
    vi.stubEnv("SEARXNG_URL", undefined)
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined)
    expect(variables(validateServerEnv().errors)).toEqual(["ENCRYPTION_MASTER_KEY"])
  })
})

describe("pesan validasi tidak pernah memuat nilai variabel", () => {
  const leakySource = validSource({
    NEXT_PUBLIC_SUPABASE_URL: "nilai-rahasia-url-AAAA",
    ENCRYPTION_MASTER_KEY: "nilai-rahasia-master-BBBB",
    CRON_SECRET: "rahasia-CCCC",
    SUPABASE_SERVICE_ROLE_KEY: ALT_SERVICE_KEY,
    OPENROUTER_API_KEY: "nilai-rahasia-openrouter-DDDD",
    SEARXNG_URL: "nilai-rahasia-searxng-EEEE",
  })
  const secretValues = Object.values(leakySource).filter(
    (value): value is string => typeof value === "string" && value !== "production"
  )

  it("laporan terformat hanya berisi nama variabel", () => {
    const report = validateServerEnv(leakySource)
    expect(report.errors.length).toBeGreaterThan(0)
    expect(report.warnings.length).toBeGreaterThan(0)
    const text = [formatServerEnvReport(report), JSON.stringify(report)].join("\n")
    for (const value of secretValues) {
      expect(text).not.toContain(value)
    }
  })

  it("error startup production juga bebas nilai variabel", () => {
    let message = ""
    try {
      checkServerEnvOnStartup(leakySource)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain("ENCRYPTION_MASTER_KEY")
    for (const value of secretValues) {
      expect(message).not.toContain(value)
    }
  })
})

describe("checkServerEnvOnStartup", () => {
  it("production: melempar error berisi daftar variabel yang bermasalah", () => {
    expect(() => checkServerEnvOnStartup({ NODE_ENV: "production" })).toThrow(
      /tidak valid \(production\)[\s\S]*\[WAJIB\] ENCRYPTION_MASTER_KEY[\s\S]*\[WAJIB\] CRON_SECRET/
    )
  })

  it("development: hanya mencetak peringatan, tidak melempar", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const report = checkServerEnvOnStartup({ NODE_ENV: "development" })
    expect(report.errors).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain("[PERINGATAN] ENCRYPTION_MASTER_KEY")
  })

  it("konfigurasi valid tidak mencetak apa pun", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(() => checkServerEnvOnStartup(validSource())).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })
})
