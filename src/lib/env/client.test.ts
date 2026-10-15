import { afterEach, describe, expect, it, vi } from "vitest"
import { getSupabasePublicConfig, publicEnv } from "./client"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("publicEnv", () => {
  it("membaca NEXT_PUBLIC_* secara lazy dan menormalkan string kosong", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://panitera.example")
    expect(publicEnv().NEXT_PUBLIC_APP_URL).toBe("https://panitera.example")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    expect(publicEnv().NEXT_PUBLIC_APP_URL).toBeUndefined()
  })
})

describe("getSupabasePublicConfig", () => {
  it("memakai publishable key, lalu alias anon key sebagai cadangan", () => {
    const url = "https://project-ref.supabase.co"
    expect(
      getSupabasePublicConfig(
        publicEnv({
          NEXT_PUBLIC_SUPABASE_URL: url,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "kunci-publishable-uji",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "kunci-anon-uji",
          NEXT_PUBLIC_APP_URL: undefined,
          NEXT_PUBLIC_APP_VERSION: undefined,
        })
      )
    ).toEqual({ url, publishableKey: "kunci-publishable-uji" })

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url)
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "kunci-anon-uji")
    expect(getSupabasePublicConfig()).toEqual({ url, publishableKey: "kunci-anon-uji" })
  })

  it("melempar pesan jelas tanpa nilai bila belum lengkap atau URL tidak valid", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined)
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "kunci-publishable-uji")
    expect(() => getSupabasePublicConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "nilai-url-rusak")
    expect(() => getSupabasePublicConfig()).toThrow("NEXT_PUBLIC_SUPABASE_URL harus berupa URL http(s) yang valid.")
  })
})
