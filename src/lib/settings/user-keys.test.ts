import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  selectedColumns: [] as string[],
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (columns: string) => {
        db.selectedColumns.push(columns)
        return { eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }
      },
    }),
  }),
}))

import { encryptCredential } from "@/lib/crypto"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_MASTER_KEY", "cd".repeat(32))
  db.row = null
  db.selectedColumns = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getUserDecryptedKeys", () => {
  it("hanya membaca kolom yang ada di skema user_settings", async () => {
    await getUserDecryptedKeys("tenant-a")
    const columns = db.selectedColumns[0].split(",").map((c) => c.trim())
    expect(columns).not.toContain("*")
    expect(columns).not.toContain("encrypted_langsmith_key")
    expect(columns).not.toContain("langsmith_project")
    expect(columns).toEqual(
      expect.arrayContaining(["encrypted_openrouter_key", "searxng_url", "search_preferences", "notification_prefs"])
    )
  })

  it("mendekripsi kunci BYOK & LangSmith dari notification_prefs milik tenant", async () => {
    db.row = {
      encrypted_openrouter_key: encryptCredential("kunci-openrouter-tenant"),
      encrypted_tavily_key: encryptCredential("kunci-tavily-tenant"),
      searxng_url: " https://searx.example.org ",
      search_preferences: { default_provider: "brave", default_ai_model: "openai/gpt-4o-mini", reasoning_effort: "high" },
      notification_prefs: {
        langsmith_api_key: encryptCredential("kunci-langsmith-tenant"),
        langsmith_project: "proyek-tenant",
        email_on_failure: true,
      },
    }

    const keys = await getUserDecryptedKeys("tenant-a")

    expect(keys.openrouterKey).toBe("kunci-openrouter-tenant")
    expect(keys.tavilyKey).toBe("kunci-tavily-tenant")
    expect(keys.braveKey).toBeUndefined()
    expect(keys.langsmithApiKey).toBe("kunci-langsmith-tenant")
    expect(keys.langsmithProject).toBe("proyek-tenant")
    expect(keys.searxngUrl).toBe("https://searx.example.org")
    expect(keys.defaultAiModel).toBe("openai/gpt-4o-mini")
    expect(keys.reasoningEffort).toBe("high")
  })

  it("notificationPrefs tidak membawa ciphertext LangSmith maupun nilai non-boolean", async () => {
    const cipher = encryptCredential("kunci-langsmith-tenant")
    db.row = { notification_prefs: { langsmith_api_key: cipher, langsmith_project: "p", developer_mode: true } }

    const keys = await getUserDecryptedKeys("tenant-a")

    expect(keys.notificationPrefs).toEqual({ developer_mode: true })
    expect(JSON.stringify(keys.notificationPrefs)).not.toContain(cipher)
  })

  it("fallback model/reasoning lama di notification_prefs tetap dibaca", async () => {
    db.row = { search_preferences: {}, notification_prefs: { default_ai_model: "model/lama", reasoning_effort: "medium" } }

    const keys = await getUserDecryptedKeys("tenant-a")

    expect(keys.defaultAiModel).toBe("model/lama")
    expect(keys.reasoningEffort).toBe("medium")
  })

  it("tanpa baris → default aman tanpa kunci", async () => {
    const keys = await getUserDecryptedKeys("tenant-a")
    expect(keys).toEqual({ searchPreferences: { default_provider: "auto" }, notificationPrefs: {} })
  })
})
