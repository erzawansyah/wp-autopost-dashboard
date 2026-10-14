import { afterEach, describe, expect, it, vi } from "vitest"
import {
  MISSING_OPENROUTER_KEY_MESSAGE,
  getPlatformKey,
  getPlatformOpenRouterKey,
  isPlatformKeyAllowed,
  requireOpenRouterKey,
  resolveOpenRouterKey,
  resolvePlatformFallbackKey,
  sanitizeApiKey,
} from "./platform-keys"

const USER_KEY = "sk-or-v1-user0000000000000000"
const PLATFORM_KEY = "sk-or-v1-platform00000000000"
const USER_PEXAFY_KEY = "pexafy-user-0000000000"
const PLATFORM_PEXAFY_KEY = "pexafy-platform-0000000000"
const PLATFORM_BING_KEY = "bing-platform-0000000000"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isPlatformKeyAllowed", () => {
  it("hanya aktif bila PLATFORM_KEY_ALLOWED tepat bernilai 'true'", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
    expect(isPlatformKeyAllowed()).toBe(false)
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "1")
    expect(isPlatformKeyAllowed()).toBe(false)
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "TRUE")
    expect(isPlatformKeyAllowed()).toBe(false)
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    expect(isPlatformKeyAllowed()).toBe(true)
  })
})

describe("sanitizeApiKey", () => {
  it("membuang spasi dan tanda kutip pembungkus", () => {
    expect(sanitizeApiKey(`  "${USER_KEY}"  `)).toBe(USER_KEY)
    expect(sanitizeApiKey(`'${USER_KEY}'`)).toBe(USER_KEY)
  })

  it("menganggap nilai kosong, tersamar, atau tidak wajar sebagai tidak ada", () => {
    expect(sanitizeApiKey(undefined)).toBeUndefined()
    expect(sanitizeApiKey(null)).toBeUndefined()
    expect(sanitizeApiKey("   ")).toBeUndefined()
    expect(sanitizeApiKey("••••••••••••••••")).toBeUndefined()
    expect(sanitizeApiKey("sk-o****a1b2")).toBeUndefined()
    expect(sanitizeApiKey("sk-or\r\nX-Injected: 1")).toBeUndefined()
    expect(sanitizeApiKey("sk-or-v1 dengan spasi")).toBeUndefined()
    expect(sanitizeApiKey("sk-or-ü")).toBeUndefined()
    expect(sanitizeApiKey("a".repeat(513))).toBeUndefined()
  })
})

describe("resolveOpenRouterKey", () => {
  it("selalu mendahulukan kunci pengguna", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("OPENROUTER_API_KEY", PLATFORM_KEY)
    expect(resolveOpenRouterKey(USER_KEY)).toBe(USER_KEY)
  })

  it("tidak memakai kunci platform tanpa PLATFORM_KEY_ALLOWED=true", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
    vi.stubEnv("OPENROUTER_API_KEY", PLATFORM_KEY)
    expect(resolveOpenRouterKey(undefined)).toBeUndefined()
    expect(resolveOpenRouterKey("")).toBeUndefined()
    expect(getPlatformOpenRouterKey()).toBeUndefined()
  })

  it("memakai kunci platform hanya bila diizinkan", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("OPENROUTER_API_KEY", ` "${PLATFORM_KEY}" `)
    expect(resolveOpenRouterKey(undefined)).toBe(PLATFORM_KEY)
    expect(resolveOpenRouterKey("••••")).toBe(PLATFORM_KEY)
  })

  it("mengembalikan undefined bila diizinkan tetapi kunci platform kosong", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("OPENROUTER_API_KEY", "")
    expect(resolveOpenRouterKey(undefined)).toBeUndefined()
  })
})

describe("requireOpenRouterKey", () => {
  it("melempar pesan BYOK yang mengarah ke /settings/keys bila tidak ada kunci", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
    vi.stubEnv("OPENROUTER_API_KEY", PLATFORM_KEY)
    expect(() => requireOpenRouterKey(undefined)).toThrow(MISSING_OPENROUTER_KEY_MESSAGE)
    expect(MISSING_OPENROUTER_KEY_MESSAGE).toContain("/settings/keys")
  })

  it("mengembalikan kunci pengguna yang sudah dirapikan", () => {
    expect(requireOpenRouterKey(` ${USER_KEY} `)).toBe(USER_KEY)
  })
})

describe("getPlatformKey", () => {
  it("tidak membaca env apa pun tanpa PLATFORM_KEY_ALLOWED=true", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
    vi.stubEnv("PEXAFY_API_KEY", PLATFORM_PEXAFY_KEY)
    vi.stubEnv("BING_SEARCH_API_KEY", PLATFORM_BING_KEY)
    expect(getPlatformKey("PEXAFY_API_KEY")).toBeUndefined()
    expect(getPlatformKey("BING_SEARCH_API_KEY", "BING_API_KEY")).toBeUndefined()
  })

  it("mengembalikan env valid pertama sesuai urutan prioritas", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("BING_SEARCH_API_KEY", "")
    vi.stubEnv("BING_API_KEY", ` ${PLATFORM_BING_KEY} `)
    expect(getPlatformKey("BING_SEARCH_API_KEY", "BING_API_KEY")).toBe(PLATFORM_BING_KEY)

    vi.stubEnv("BING_SEARCH_API_KEY", "bing-utama-0000000000")
    expect(getPlatformKey("BING_SEARCH_API_KEY", "BING_API_KEY")).toBe("bing-utama-0000000000")
  })

  it("mengembalikan undefined bila diizinkan tetapi tidak ada env yang valid", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("BING_SEARCH_API_KEY", "")
    vi.stubEnv("BING_API_KEY", "kunci dengan spasi")
    expect(getPlatformKey("BING_SEARCH_API_KEY", "BING_API_KEY")).toBeUndefined()
    expect(getPlatformKey()).toBeUndefined()
  })
})

describe("resolvePlatformFallbackKey", () => {
  it("selalu mendahulukan kunci BYOK pengguna", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("PEXAFY_API_KEY", PLATFORM_PEXAFY_KEY)
    expect(resolvePlatformFallbackKey(` ${USER_PEXAFY_KEY} `, "PEXAFY_API_KEY")).toBe(USER_PEXAFY_KEY)
  })

  it("tidak memakai kunci platform sebagai cadangan tenant tanpa izin operator", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "false")
    vi.stubEnv("PEXAFY_API_KEY", PLATFORM_PEXAFY_KEY)
    expect(resolvePlatformFallbackKey(undefined, "PEXAFY_API_KEY")).toBeUndefined()
    expect(resolvePlatformFallbackKey("", "PEXAFY_API_KEY")).toBeUndefined()
    expect(resolvePlatformFallbackKey("••••••••", "PEXAFY_API_KEY")).toBeUndefined()
  })

  it("memakai kunci platform hanya bila diizinkan dan kunci pengguna tidak ada", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("PEXAFY_API_KEY", PLATFORM_PEXAFY_KEY)
    expect(resolvePlatformFallbackKey(null, "PEXAFY_API_KEY")).toBe(PLATFORM_PEXAFY_KEY)
  })

  it("tidak mencampur env provider lain", () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("PEXAFY_API_KEY", "")
    vi.stubEnv("OPENROUTER_API_KEY", PLATFORM_KEY)
    expect(resolvePlatformFallbackKey(undefined, "PEXAFY_API_KEY")).toBeUndefined()
  })
})
