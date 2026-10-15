import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  selectedColumns: [] as string[],
  filters: [] as [string, unknown][],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: (columns: string) => {
        mocks.selectedColumns.push(columns)
        return {
          eq: (column: string, value: unknown) => {
            mocks.filters.push([column, value])
            return { maybeSingle: mocks.maybeSingle }
          },
        }
      },
      upsert: mocks.upsert,
    }),
  }),
}))

vi.mock("@/lib/crypto", () => ({
  encryptCredential: (plain: string) => `enc(${plain})`,
}))

import { GET, PUT } from "@/app/api/settings/user/route"

const ENDPOINT = "http://localhost/api/settings/user"
const TENANT_A = "11111111-1111-4111-8111-111111111111"
/** Nilai tiruan berformat `iv:authTag:cipher` milik tenant; tidak boleh muncul di respons. */
const TENANT_LANGSMITH_CIPHER = "aa11:bb22:langsmithcipher"
const TENANT_OPENROUTER_CIPHER = "cc33:dd44:openroutercipher"
const OPERATOR_LANGSMITH_KEY = "operator-langsmith-0000000000"

const ctx = { params: Promise.resolve({}) }

function asUser(userId: string | null) {
  mocks.getUser.mockResolvedValue(
    userId ? { data: { user: { id: userId } }, error: null } : { data: { user: null }, error: { message: "no session" } }
  )
}

function withStoredRow(row: Record<string, unknown> | null) {
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null })
}

const getSettings = () => GET(new Request(ENDPOINT), ctx)

function putSettings(body: unknown) {
  return PUT(
    new Request(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx
  )
}

function lastUpsertPayload(): Record<string, unknown> {
  const call = mocks.upsert.mock.calls.at(-1)
  if (!call) throw new Error("upsert tidak dipanggil")
  return call[0] as Record<string, unknown>
}

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.maybeSingle.mockReset()
  mocks.upsert.mockReset()
  mocks.selectedColumns = []
  mocks.filters = []
  asUser(TENANT_A)
  withStoredRow(null)
  mocks.upsert.mockResolvedValue({ error: null })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/settings/user", () => {
  it("menolak permintaan tanpa sesi (401 bentuk error standar)", async () => {
    asUser(null)
    const res = await getSettings()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String), code: "unauthorized" })
  })

  it("membaca hanya kolom skema (tanpa kolom LangSmith fiktif) milik pengguna sesi", async () => {
    await getSettings()
    const columns = mocks.selectedColumns[0].split(",").map((c) => c.trim())
    expect(columns).not.toContain("*")
    expect(columns).not.toContain("encrypted_langsmith_key")
    expect(columns).not.toContain("langsmith_project")
    expect(mocks.filters).toContainEqual(["user_id", TENANT_A])
  })

  it("tidak memakai kunci/project LangSmith milik operator sebagai status tenant", async () => {
    vi.stubEnv("LANGSMITH_API_KEY", OPERATOR_LANGSMITH_KEY)
    vi.stubEnv("LANGCHAIN_API_KEY", OPERATOR_LANGSMITH_KEY)
    vi.stubEnv("LANGSMITH_PROJECT", "proyek-operator")
    vi.stubEnv("LANGCHAIN_PROJECT", "proyek-operator")
    withStoredRow({ notification_prefs: {} })

    const res = await getSettings()
    const raw = await res.text()
    const body = JSON.parse(raw)

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.userId).toBe(TENANT_A)
    expect(body.keys.langsmith).toEqual({ configured: false, maskedKey: null })
    expect(body.langsmithProject).toBe("panitera")
    expect(raw).not.toContain(OPERATOR_LANGSMITH_KEY)
    expect(raw).not.toContain("proyek-operator")
  })

  it("tidak pernah mengirim kredensial terenkripsi, termasuk langsmith_api_key di notification_prefs", async () => {
    withStoredRow({
      encrypted_openrouter_key: TENANT_OPENROUTER_CIPHER,
      notification_prefs: {
        langsmith_api_key: TENANT_LANGSMITH_CIPHER,
        langsmith_project: "proyek-tenant",
        email_on_failure: true,
        developer_mode: true,
        default_ai_model: "openai/gpt-4o-mini",
        sisipan_asing: "x",
      },
      search_preferences: { default_provider: "brave", reasoning_effort: "high", sisipan_asing: "y" },
    })

    const res = await getSettings()
    const raw = await res.text()
    const body = JSON.parse(raw)

    expect(raw).not.toContain(TENANT_LANGSMITH_CIPHER)
    expect(raw).not.toContain(TENANT_OPENROUTER_CIPHER)
    expect(raw).not.toContain("langsmith_api_key")
    expect(raw).not.toContain("sisipan_asing")
    expect(body.notificationPrefs).toEqual({ email_on_failure: true, developer_mode: true })
    expect(body.developerMode).toBe(true)
    expect(body.keys.langsmith).toEqual({ configured: true, maskedKey: "••••••••••••••••" })
    expect(body.keys.openrouter.configured).toBe(true)
    expect(body.keys.tavily).toEqual({ configured: false, maskedKey: null })
    expect(body.langsmithProject).toBe("proyek-tenant")
    expect(body.defaultAiModel).toBe("openai/gpt-4o-mini")
    expect(body.reasoningEffort).toBe("high")
    expect(body.searchPreferences).toEqual({ default_provider: "brave", reasoning_effort: "high" })
  })

  it("mengembalikan provider 'auto' bila provider tersimpan tidak dikenal", async () => {
    withStoredRow({ search_preferences: { default_provider: "google_rahasia" } })
    const body = await (await getSettings()).json()
    expect(body.searchPreferences.default_provider).toBe("auto")
  })

  it("tidak membocorkan pesan error database", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "relation user_settings detail internal" } })

    const res = await getSettings()
    const raw = await res.text()

    expect(res.status).toBe(500)
    expect(JSON.parse(raw).code).toBe("internal_error")
    expect(raw).not.toContain("detail internal")
  })
})

describe("PUT /api/settings/user", () => {
  it("menolak tanpa sesi", async () => {
    asUser(null)
    const res = await putSettings({ developerMode: true })
    expect(res.status).toBe(401)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("menolak body yang bukan objek JSON", async () => {
    const res = await putSettings(["bukan", "objek"])
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("validation_failed")
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it.each([
    ["default_provider tidak didukung webSearch()", { searchPreferences: { default_provider: "google" } }, "tidak didukung"],
    ["reasoningEffort di luar low/medium/high", { reasoningEffort: "ekstrem" }, "reasoning"],
    ["notificationPrefs non-boolean", { notificationPrefs: { email_on_failure: "ya" } }, "notificationPrefs"],
  ])("menolak %s", async (_label, body, fragment) => {
    const res = await putSettings(body)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.code).toBe("validation_failed")
    expect(json.error).toContain(fragment)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("menyimpan default_provider yang didukung dan membuang kunci asing", async () => {
    const res = await putSettings({ searchPreferences: { default_provider: "serpapi", reasoning_effort: "medium", sisipan: 1 } })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, message: expect.any(String) })
    expect(lastUpsertPayload().user_id).toBe(TENANT_A)
    expect(lastUpsertPayload().search_preferences).toEqual({ default_provider: "serpapi", reasoning_effort: "medium" })
  })

  it("notificationPrefs dari client tidak bisa menimpa kredensial LangSmith atau menyisipkan kunci asing", async () => {
    withStoredRow({
      notification_prefs: { langsmith_api_key: TENANT_LANGSMITH_CIPHER, langsmith_project: "proyek-tenant" },
    })

    const res = await putSettings({
      notificationPrefs: {
        email_on_failure: false,
        langsmith_api_key: "nilai-dari-client",
        langsmith_project: "proyek-client",
        sisipan_asing: true,
      },
    })

    expect(res.status).toBe(200)
    expect(lastUpsertPayload().notification_prefs).toEqual({
      email_on_failure: false,
      langsmith_api_key: TENANT_LANGSMITH_CIPHER,
      langsmith_project: "proyek-tenant",
    })
  })

  it("mengenkripsi kunci LangSmith baru dan mengabaikan nilai tersamar", async () => {
    withStoredRow({ notification_prefs: { langsmith_api_key: TENANT_LANGSMITH_CIPHER } })

    await putSettings({ langsmithApiKey: "••••••••" })
    expect(lastUpsertPayload().notification_prefs).toMatchObject({ langsmith_api_key: TENANT_LANGSMITH_CIPHER })

    await putSettings({ langsmithApiKey: " kunci-langsmith-baru " })
    expect(lastUpsertPayload().notification_prefs).toMatchObject({
      langsmith_api_key: "enc(kunci-langsmith-baru)",
      langsmith_project: "panitera",
    })
  })

  it("kunci BYOK: baru dienkripsi, kosong dihapus, tersamar/tidak dikirim tidak disentuh", async () => {
    const res = await putSettings({ openrouterKey: " sk-baru ", tavilyKey: "", braveKey: "••••" })

    expect(res.status).toBe(200)
    const payload = lastUpsertPayload()
    expect(payload.encrypted_openrouter_key).toBe("enc(sk-baru)")
    expect(payload.encrypted_tavily_key).toBeNull()
    expect(payload).not.toHaveProperty("encrypted_brave_key")
    expect(payload).not.toHaveProperty("encrypted_serpapi_key")
    expect(JSON.stringify(await res.json())).not.toContain("sk-baru")
  })

  it("defaultAiModel/reasoningEffort tingkat atas digabung ke search_preferences tersimpan", async () => {
    withStoredRow({ search_preferences: { default_provider: "tavily" } })

    await putSettings({ defaultAiModel: "anthropic/claude", reasoningEffort: "high" })

    expect(lastUpsertPayload().search_preferences).toEqual({
      default_provider: "tavily",
      default_ai_model: "anthropic/claude",
      reasoning_effort: "high",
    })
  })

  it("searxngUrl privat/lokal ditolak (Anti-SSRF), kosong = kembali ke default", async () => {
    const blocked = await putSettings({ searxngUrl: "http://127.0.0.1:8080" })
    expect(blocked.status).toBe(400)
    expect((await blocked.json()).error).toContain("SearxNG")
    expect(mocks.upsert).not.toHaveBeenCalled()

    await putSettings({ searxngUrl: "" })
    expect(lastUpsertPayload().searxng_url).toBeNull()
  })

  it("gagal menyimpan → 500 generik tanpa detail database", async () => {
    mocks.upsert.mockResolvedValue({ error: { code: "XX000", message: "detail internal upsert" } })
    const res = await putSettings({ developerMode: true })
    const raw = await res.text()
    expect(res.status).toBe(500)
    expect(raw).not.toContain("detail internal")
  })
})
