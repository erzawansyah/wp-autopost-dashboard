import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, PUT } from "@/app/api/settings/user/route"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
      upsert: mocks.upsert,
    }),
  }),
}))

vi.mock("@/lib/crypto", () => ({
  encryptCredential: (plain: string) => `enc(${plain})`,
}))

const ENDPOINT = "http://localhost/api/settings/user"
/** Nilai tiruan berformat `iv:authTag:cipher` milik tenant; tidak boleh muncul di respons. */
const TENANT_LANGSMITH_CIPHER = "aa11:bb22:langsmithcipher"
const TENANT_OPENROUTER_CIPHER = "cc33:dd44:openroutercipher"
const OPERATOR_LANGSMITH_KEY = "operator-langsmith-0000000000"

function asUser(userId: string) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
}

function withStoredRow(row: Record<string, unknown> | null) {
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null })
}

function putRequest(body: unknown) {
  return new Request(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function lastUpsertPayload(): Record<string, unknown> {
  const call = mocks.upsert.mock.calls.at(-1)
  if (!call) throw new Error("upsert tidak dipanggil")
  return call[0] as Record<string, unknown>
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  asUser("tenant-a")
  withStoredRow(null)
  mocks.upsert.mockResolvedValue({ error: null })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/settings/user", () => {
  it("menolak permintaan tanpa sesi", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("tidak memakai kunci/project LangSmith milik operator sebagai status tenant", async () => {
    vi.stubEnv("LANGSMITH_API_KEY", OPERATOR_LANGSMITH_KEY)
    vi.stubEnv("LANGCHAIN_API_KEY", OPERATOR_LANGSMITH_KEY)
    vi.stubEnv("LANGSMITH_PROJECT", "proyek-operator")
    vi.stubEnv("LANGCHAIN_PROJECT", "proyek-operator")
    withStoredRow({ user_id: "tenant-a", notification_prefs: {} })

    const res = await GET()
    const raw = await res.text()
    const body = JSON.parse(raw)

    expect(res.status).toBe(200)
    expect(body.keys.langsmith).toEqual({ configured: false, maskedKey: null })
    expect(body.langsmithProject).toBe("panitera")
    expect(raw).not.toContain(OPERATOR_LANGSMITH_KEY)
    expect(raw).not.toContain("proyek-operator")
  })

  it("tidak pernah mengirim kredensial terenkripsi, termasuk langsmith_api_key di notification_prefs", async () => {
    withStoredRow({
      user_id: "tenant-a",
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

    const res = await GET()
    const raw = await res.text()
    const body = JSON.parse(raw)

    expect(raw).not.toContain(TENANT_LANGSMITH_CIPHER)
    expect(raw).not.toContain(TENANT_OPENROUTER_CIPHER)
    expect(raw).not.toContain("langsmith_api_key")
    expect(raw).not.toContain("sisipan_asing")
    expect(body.notificationPrefs).toEqual({ email_on_failure: true, developer_mode: true })
    expect(body.developerMode).toBe(true)
    expect(body.keys.langsmith.configured).toBe(true)
    expect(body.keys.openrouter.configured).toBe(true)
    expect(body.langsmithProject).toBe("proyek-tenant")
    expect(body.defaultAiModel).toBe("openai/gpt-4o-mini")
    expect(body.searchPreferences).toEqual({ default_provider: "brave", reasoning_effort: "high" })
  })

  it("mengembalikan provider 'auto' bila provider tersimpan tidak dikenal", async () => {
    withStoredRow({ user_id: "tenant-a", search_preferences: { default_provider: "google_rahasia" } })

    const body = await (await GET()).json()

    expect(body.searchPreferences.default_provider).toBe("auto")
  })

  it("tidak membocorkan pesan error database", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "relation user_settings detail internal" } })

    const res = await GET()
    const raw = await res.text()

    expect(res.status).toBe(500)
    expect(raw).not.toContain("detail internal")
  })
})

describe("PUT /api/settings/user", () => {
  it("menolak body yang bukan objek JSON", async () => {
    const res = await PUT(putRequest(["bukan", "objek"]))
    expect(res.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("menolak default_provider yang tidak didukung webSearch()", async () => {
    const res = await PUT(putRequest({ searchPreferences: { default_provider: "google" } }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain("tidak didukung")
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("menyimpan default_provider yang didukung dan membuang kunci asing", async () => {
    const res = await PUT(
      putRequest({ searchPreferences: { default_provider: "serpapi", reasoning_effort: "medium", sisipan: 1 } }),
    )

    expect(res.status).toBe(200)
    expect(lastUpsertPayload().search_preferences).toEqual({
      default_provider: "serpapi",
      reasoning_effort: "medium",
    })
  })

  it("notificationPrefs dari client tidak bisa menimpa kredensial LangSmith atau menyisipkan kunci asing", async () => {
    withStoredRow({
      user_id: "tenant-a",
      notification_prefs: { langsmith_api_key: TENANT_LANGSMITH_CIPHER, langsmith_project: "proyek-tenant" },
    })

    const res = await PUT(
      putRequest({
        notificationPrefs: {
          email_on_failure: false,
          langsmith_api_key: "nilai-dari-client",
          langsmith_project: "proyek-client",
          sisipan_asing: true,
        },
      }),
    )

    expect(res.status).toBe(200)
    expect(lastUpsertPayload().notification_prefs).toEqual({
      email_on_failure: false,
      langsmith_api_key: TENANT_LANGSMITH_CIPHER,
      langsmith_project: "proyek-tenant",
    })
  })

  it("mengenkripsi kunci LangSmith baru dan mengabaikan nilai tersamar", async () => {
    withStoredRow({ user_id: "tenant-a", notification_prefs: { langsmith_api_key: TENANT_LANGSMITH_CIPHER } })

    await PUT(putRequest({ langsmithApiKey: "••••••••" }))
    expect(lastUpsertPayload().notification_prefs).toMatchObject({ langsmith_api_key: TENANT_LANGSMITH_CIPHER })

    await PUT(putRequest({ langsmithApiKey: " kunci-langsmith-baru " }))
    expect(lastUpsertPayload().notification_prefs).toMatchObject({
      langsmith_api_key: "enc(kunci-langsmith-baru)",
      langsmith_project: "panitera",
    })
  })
})
