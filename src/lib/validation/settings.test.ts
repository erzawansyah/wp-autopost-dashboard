import { describe, expect, expectTypeOf, it } from "vitest"
import type { WebSearchProvider } from "@/core/shared/tools/web-search"
import {
  ApiKeysFormSchema,
  BYOK_KEY_FIELDS,
  ProfilePreferencesFormSchema,
  SEARCH_PROVIDERS,
  SearchTestBodySchema,
  UpdateUserSettingsBodySchema,
  type SearchProvider,
} from "./settings"

describe("skema pengaturan bersama", () => {
  it("provider form/DB persis sama dengan provider yang ditangani webSearch()", () => {
    expectTypeOf<SearchProvider>().toEqualTypeOf<WebSearchProvider>()
    expect(SEARCH_PROVIDERS).toContain("auto")
  })

  it("body PUT hanya menerima developerMode untuk notification_prefs; notificationPrefs (klien lama) dibuang", () => {
    const parsed = UpdateUserSettingsBodySchema.parse({
      notificationPrefs: { langsmith_api_key: "x", in_app_toast: false, email_on_failure: true },
      developerMode: true,
    })
    expect(parsed).toEqual({ developerMode: true })
  })

  it("uji provider pencarian wajib kunci untuk tavily/brave/serpapi/pexafy", () => {
    expect(SearchTestBodySchema.safeParse({ provider: "tavily", apiKey: "  " }).success).toBe(false)
    expect(SearchTestBodySchema.safeParse({ provider: "serpapi", apiKey: "" }).success).toBe(false)
    expect(SearchTestBodySchema.safeParse({ provider: "serpapi", apiKey: "kunci-uji" }).success).toBe(true)
    expect(SearchTestBodySchema.safeParse({ provider: "pexafy", apiKey: "pxf_1" }).success).toBe(true)
  })

  it("setiap field kunci BYOK form punya padanan di body PUT & skema form (termasuk serpapiKey)", () => {
    expect(BYOK_KEY_FIELDS).toContain("serpapiKey")
    for (const field of BYOK_KEY_FIELDS) {
      expect(UpdateUserSettingsBodySchema.shape).toHaveProperty(field)
      expect(ApiKeysFormSchema.shape).toHaveProperty(field)
    }
  })

  it("form profil hanya berisi Developer Mode (sakelar notifikasi tanpa efek sudah dihapus)", () => {
    expect(Object.keys(ProfilePreferencesFormSchema.shape)).toEqual(["developerMode"])
    expect(ProfilePreferencesFormSchema.safeParse({ developerMode: false }).success).toBe(true)
    expect(ProfilePreferencesFormSchema.safeParse({}).success).toBe(false)
  })
})
