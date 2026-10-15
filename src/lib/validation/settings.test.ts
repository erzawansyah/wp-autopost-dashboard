import { describe, expect, expectTypeOf, it } from "vitest"
import type { WebSearchProvider } from "@/core/shared/tools/web-search"
import {
  CLIENT_NOTIFICATION_PREF_KEYS,
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

  it("kunci notification_prefs client tidak memuat kredensial LangSmith", () => {
    expect(CLIENT_NOTIFICATION_PREF_KEYS).not.toContain("langsmith_api_key")
    const parsed = UpdateUserSettingsBodySchema.parse({ notificationPrefs: { langsmith_api_key: "x", in_app_toast: false } })
    expect(parsed.notificationPrefs).toEqual({ in_app_toast: false })
  })

  it("uji provider pencarian wajib kunci untuk tavily/brave/pexafy", () => {
    expect(SearchTestBodySchema.safeParse({ provider: "tavily", apiKey: "  " }).success).toBe(false)
    expect(SearchTestBodySchema.safeParse({ provider: "pexafy", apiKey: "pxf_1" }).success).toBe(true)
  })

  it("form profil wajib boolean untuk setiap preferensi", () => {
    expect(
      ProfilePreferencesFormSchema.safeParse({
        email_on_failure: true,
        email_on_batch_complete: false,
        in_app_toast: true,
        developerMode: false,
      }).success
    ).toBe(true)
    expect(ProfilePreferencesFormSchema.safeParse({ email_on_failure: true }).success).toBe(false)
  })
})
