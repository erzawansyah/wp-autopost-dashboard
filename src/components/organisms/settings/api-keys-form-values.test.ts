import { describe, expect, it } from "vitest"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { ApiKeysFormSchema, FOLLOW_PROFILE_REASONING, UpdateUserSettingsBodySchema } from "@/lib/validation/settings"
import type { UserSettings } from "@/types/settings"
import {
  EMPTY_BYOK_KEYS,
  describeOpenRouterCheck,
  toApiKeysFormValues,
  toUserSettingsUpdate,
} from "./api-keys-form-values"

const notConfigured = { configured: false, maskedKey: null }

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    keys: {
      openrouter: { configured: true, maskedKey: "••••" },
      tavily: notConfigured,
      brave: notConfigured,
      serpapi: notConfigured,
      pexafy: notConfigured,
      langsmith: notConfigured,
    },
    reasoningEffort: null,
    searxngUrl: null,
    searchPreferences: { default_provider: "auto" },
    developerMode: false,
    ...overrides,
  }
}

describe("toApiKeysFormValues", () => {
  it("input kunci selalu kosong walau kunci tersimpan; preferensi diisi dari server", () => {
    const values = toApiKeysFormValues(
      settings({
        defaultAiModel: "openai/gpt-4o-mini",
        reasoningEffort: "high",
        langsmithProject: "proyek-saya",
        searchPreferences: { default_provider: "brave" },
      })
    )
    expect(values).toEqual({
      ...EMPTY_BYOK_KEYS,
      defaultAiModel: "openai/gpt-4o-mini",
      reasoningEffort: "high",
      defaultSearchProvider: "brave",
      langsmithProject: "proyek-saya",
    })
  })

  it("nilai kosong jatuh ke default (model global, ikuti Agent Profile, auto, panitera)", () => {
    const values = toApiKeysFormValues(settings({ defaultAiModel: null, searchPreferences: {} }))
    expect(values.defaultAiModel).toBe(DEFAULT_AI_MODEL)
    expect(values.reasoningEffort).toBe(FOLLOW_PROFILE_REASONING)
    expect(values.defaultSearchProvider).toBe("auto")
    expect(values.langsmithProject).toBe("panitera")
  })

  it("lolos skema form", () => {
    expect(ApiKeysFormSchema.safeParse(toApiKeysFormValues(settings())).success).toBe(true)
  })
})

describe("toUserSettingsUpdate", () => {
  const base = toApiKeysFormValues(settings())

  it("kunci kosong tidak dikirim (kunci tersimpan tidak berubah); searxngUrl tidak pernah dikirim", () => {
    const update = toUserSettingsUpdate(base)
    expect(update).not.toHaveProperty("openrouterKey")
    expect(update).not.toHaveProperty("langsmithApiKey")
    expect(update).not.toHaveProperty("searxngUrl")
    expect(update.searchPreferences).toEqual({ default_provider: "auto", default_ai_model: DEFAULT_AI_MODEL })
    expect(UpdateUserSettingsBodySchema.safeParse(update).success).toBe(true)
  })

  it("tingkat penalaran: 'Ikuti Agent Profile' dikirim sebagai null (hapus), selain itu nilainya", () => {
    expect(toUserSettingsUpdate(base).reasoningEffort).toBeNull()
    const update = toUserSettingsUpdate({ ...base, reasoningEffort: "high" })
    expect(update.reasoningEffort).toBe("high")
    expect(UpdateUserSettingsBodySchema.safeParse(update).success).toBe(true)
  })

  it("hanya kunci yang diketik yang dikirim (di-trim)", () => {
    const update = toUserSettingsUpdate({ ...base, tavilyKey: "  tvly-baru  ", langsmithApiKey: "lsv2_pt_x" })
    expect(update.tavilyKey).toBe("tvly-baru")
    expect(update.langsmithApiKey).toBe("lsv2_pt_x")
    expect(update).not.toHaveProperty("braveKey")
    expect(update).not.toHaveProperty("serpapiKey")
  })

  it("kunci SerpAPI yang diketik ikut dikirim sebagai serpapiKey (body PUT yang sama dengan kunci lain)", () => {
    expect(base.serpapiKey).toBe("")
    const update = toUserSettingsUpdate({ ...base, serpapiKey: "  kunci-serpapi-uji  " })
    expect(update.serpapiKey).toBe("kunci-serpapi-uji")
    expect(UpdateUserSettingsBodySchema.safeParse(update).success).toBe(true)
  })

  it("nama project LangSmith kosong → default panitera", () => {
    expect(toUserSettingsUpdate({ ...base, langsmithProject: "   " }).langsmithProject).toBe("panitera")
  })
})

describe("ApiKeysFormSchema", () => {
  it("menolak kunci bernilai tersamar agar tidak diam-diam diabaikan server", () => {
    const result = ApiKeysFormSchema.safeParse({ ...toApiKeysFormValues(settings()), openrouterKey: "••••••••" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(["openrouterKey"])
  })
})

describe("describeOpenRouterCheck", () => {
  it("menampilkan sisa kuota bila limit & usage ada", () => {
    expect(describeOpenRouterCheck({ limit: 10, usage: 2.5 })).toBe("Koneksi OpenRouter terverifikasi! Kuota tersisa: $7.50")
  })

  it("tanpa limit (akun tanpa batas kredit) → pesan umum", () => {
    expect(describeOpenRouterCheck({ limit: null, usage: 1 })).toBe("Koneksi OpenRouter terverifikasi!")
  })
})
