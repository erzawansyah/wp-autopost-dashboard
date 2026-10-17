import "server-only"
import { cache } from "react"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { ToolInputParsingException } from "@langchain/core/tools"
import { run } from "@/core/writer"
import { BUILTIN_PRESETS } from "@/core/writer/profiles"
import { ToolRegistry } from "@/core/writer/tools"
import { redactSecrets, redactSecretsInText } from "@/lib/security/redact"
import { RunRecorder, type AgentStepEvent } from "@/core/writer/runtime/telemetry"
import { readToolArtifact } from "@/core/writer/tools/tool-response"
import { failureFromError, toolFailure, type ToolFailure } from "@/core/shared/tools/contract"
import { searchRoyaltyFreeImages, type ImageSearchProvider } from "@/core/shared/tools/image-search"
import { getKeywordSuggestions } from "@/core/shared/tools/keyword-suggestions"
import { READ_LENGTH_BOUNDS, READ_ORIGINS, READ_UNIT_LABELS_ID, READ_UNITS, readWebContent } from "@/core/shared/tools/web-reader"
import { webSearch, type WebSearchProvider } from "@/core/shared/tools/web-search"
import { publishPostToWordPress } from "@/core/shared/tools/wordpress-publisher"
import { hasLabAccess } from "@/lib/constants/auth"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import type { LabProfileManifest, LabRegistry, LabSiteOption, LabToolManifest } from "@/types/lab"
import type { DecryptedUserKeys } from "@/types/settings"
import { ApiError, badRequest, forbidden, notFound, throwIfDbError } from "@/server/http/errors"
import { getOwnedSiteCredentials } from "@/server/services/wp-tools"

/**
 * Service Laboratorium (Developer Mode). Redaksi Lab bersifat terarah, bukan menyeluruh: konten
 * artikel, preview, dan URL hasil riset dikembalikan apa adanya (redaksi teks menyeluruh merusak
 * "Basic Training", URL gambar ber-`?token=`, dsb.). Yang disamarkan hanya jalur yang dapat
 * membawa kredensial:
 * - pesan error (bisa memuat URL request/header mentah) → `redactLabText`;
 * - log eksekusi agen (`execution`: nodeLogs berisi request/site/input) → `redactSecrets` penuh;
 * - keluaran tool generik (data artifact `ToolOutcome`) → properti bernama rahasia saja (`scanText: false`).
 * Kegagalan tool (`ToolOutcome` gagal) tetap HTTP 200 `ok: false` dengan `error` teredaksi, `code`, dan `retryable`.
 * Kunci OpenRouter TIDAK diterima dari body: Lab hanya memakai kunci BYOK tersimpan milik pengguna.
 */

function redactLabText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : redactSecretsInText(value)
}

const LAB_ERROR_MAX_CHARS = 500

/** Kegagalan tool bertipe → payload Lab `ok: false` (HTTP 200) dengan pesan teredaksi. */
function labToolFailure(failure: ToolFailure, durationMs: number): LabRunResult {
  const error = redactLabText(failure.message)
  return { ok: false, error, code: failure.code, retryable: failure.retryable, summary: error, durationMs }
}

/** Error tak terduga saat eksekusi Lab: pesan & `cause` (untuk log server) sudah diredaksi. */
function labExecutionError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const raw = err instanceof Error ? err.message : "Terjadi kesalahan internal lab"
  const message = redactSecretsInText(raw).slice(0, LAB_ERROR_MAX_CHARS)
  return new ApiError(500, "internal_error", message, { cause: { message } })
}

/**
 * Akses Lab untuk render RSC `/lab`: layout (halaman ramah) dan page (sebelum membaca data) berbagi SATU
 * query per request lewat React `cache` (client sesi & user dari `requireSession()` yang juga ter-cache).
 */
export const getLabAccess = cache((supabase: SupabaseClient, user: User): Promise<boolean> => hasLabAccess(supabase, user))

/** Gerbang Developer Mode (`user_settings.notification_prefs.developer_mode`) untuk route API Lab. */
export async function assertLabAccess(supabase: SupabaseClient, user: User): Promise<void> {
  if (!(await hasLabAccess(supabase, user))) {
    throw forbidden("Aktifkan Developer Mode di Pengaturan ➔ Profil & Preferensi Akun untuk mengakses Laboratorium.")
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const TOOL_DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  web_search: { query: "perkembangan artificial intelligence indonesia" },
  keyword_suggestions: { query: "kopi robusta", limit: 15 },
  web_reader: { url: "https://example.com" },
  image_search: { query: "modern artificial intelligence workspace" },
  upload_media: {
    imageUrl: "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg",
    altText: "Contoh foto teknologi",
    isFeatured: true,
  },
  set_featured_image: { query: "modern workspace technology", altText: "Featured image sampul" },
}

const PUBLISHER_SAMPLE_HTML =
  "<!-- wp:paragraph -->\n<p>Ini adalah paragraf pengujian penerbitan naskah WordPress dari Dev Lab.</p>\n<!-- /wp:paragraph -->"

/** Tool khusus Lab untuk uji kirim naskah ke WordPress (default draft). */
const PUBLISHER_TOOL: LabToolManifest = {
  id: "wordpress_publisher",
  name: "WordPress Publisher (Direct Test)",
  description: "Mengirim artikel berformat Gutenberg Blocks ke WordPress REST API dengan status draft/publish/future.",
  requiresSite: true,
  defaultParams: {
    title: "Artikel Uji Coba dari Laboratorium",
    contentHtml: PUBLISHER_SAMPLE_HTML,
    status: "draft",
    excerpt: "Ringkasan uji coba laboratorium...",
  },
  inputFields: [
    {
      name: "title",
      label: "Judul Artikel",
      type: "text",
      defaultValue: "Artikel Uji Coba dari Laboratorium",
      description: "Judul postingan yang akan dibuat di WordPress.",
    },
    {
      name: "status",
      label: "Status Publikasi",
      type: "select",
      defaultValue: "draft",
      options: [
        { value: "draft", label: "Draft (Simpan sebagai Konsep)" },
        { value: "publish", label: "Publish (Tayang Langsung)" },
      ],
    },
    {
      name: "contentHtml",
      label: "Konten HTML / Gutenberg Blocks",
      type: "textarea",
      defaultValue: PUBLISHER_SAMPLE_HTML,
      description: "Markup HTML atau komentar blok Gutenberg yang akan disuntikkan ke wp/v2/posts.",
    },
  ],
}

/** Data pendukung Lab: situs milik pengguna, manifest tool, dan Agent Profile (bawaan + kustom). */
export async function getLabRegistry(supabase: SupabaseClient, userId: string): Promise<LabRegistry> {
  const [sitesRes, profilesRes] = await Promise.all([
    supabase
      .from("wp_sites")
      .select("id, site_name, base_url, wp_username, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_profiles")
      .select("id, name, description, mode, model, tool_ids")
      .eq("user_id", userId)
      .eq("is_archived", false),
  ])
  throwIfDbError(sitesRes.error)
  throwIfDbError(profilesRes.error)

  const tools: LabToolManifest[] = ToolRegistry.getAll().map((tool) => ({
    id: tool.id,
    name: tool.label,
    description: tool.description,
    requiresSite: (tool.requirements || []).some((r) => r.type === "wp_site"),
    defaultParams: TOOL_DEFAULT_PARAMS[tool.id] ?? {},
    inputFields: tool.inputFields || [],
  }))
  tools.push(PUBLISHER_TOOL)

  const presetProfiles: LabProfileManifest[] = BUILTIN_PRESETS.map((preset) => ({
    id: preset.ref,
    name: preset.name,
    description: preset.description || "",
    mode: preset.mode,
    toolCount: preset.toolIds.length,
    isPreset: true,
    // Model preset tidak pernah mengalahkan model default akun (`resolve-model.ts`).
    model: null,
    defaultRequest: {
      keyword: "cara merawat tanaman hias di dalam ruangan",
      brief: "Berikan tips pencahayaan, penyiraman, dan pemupukan yang ideal.",
    },
  }))

  type ProfileRow = {
    id: string
    name: string
    description: string | null
    mode: string
    model: string | null
    tool_ids: unknown
  }
  const customProfiles: LabProfileManifest[] = ((profilesRes.data ?? []) as ProfileRow[]).map((profile) => ({
    id: profile.id,
    name: profile.name,
    description: profile.description || "",
    mode: profile.mode,
    toolCount: Array.isArray(profile.tool_ids) ? profile.tool_ids.length : 0,
    isPreset: false,
    model: profile.model?.trim() || null,
    defaultRequest: {
      keyword: "panduan investasi saham untuk pemula",
      brief: "Fokus pada tips fundamental dan diversifikasi portofolio.",
    },
  }))

  return { sites: (sitesRes.data ?? []) as LabSiteOption[], tools, profiles: [...presetProfiles, ...customProfiles] }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

type LabInput = Record<string, unknown>

interface LabRunRequest {
  /** ID tool (`type: "tool"`) atau ref Agent Profile. */
  targetId: string
  siteId?: string
  model?: string
  input: LabInput
  /** Sinyal pembatalan request HTTP: diteruskan ke tool & `writer.run` (`abortSignal`). */
  signal?: AbortSignal
}

/** Payload respons Lab; `ok: false` tetap HTTP 200 agar UI dapat menampilkan hasil parsial. */
type LabRunResult = { ok: boolean; durationMs: number } & Record<string, unknown>

function text(input: LabInput, key: string, fallback = ""): string {
  const value = input[key]
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

/** Angka positif dari input form (string/number) dijepit ke rentang; selain itu fallback. */
function positiveInt(input: LabInput, key: string, fallback: number, max: number): number {
  const value = Number(input[key])
  return Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : fallback
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

const WEB_SEARCH_PROVIDERS: readonly WebSearchProvider[] = [
  "auto",
  "tavily",
  "brave",
  "searxng",
  "bing_scraper",
  "serpapi",
  "open_knowledge",
]
const IMAGE_SEARCH_PROVIDERS: readonly ImageSearchProvider[] = [
  "auto",
  "pexafy",
  "searxng",
  "bing_scraper",
  "bing_api",
  "curated",
]

interface LabSite {
  id: string
  baseUrl: string
  username: string
  applicationPassword: string
}

async function resolveLabSite(supabase: SupabaseClient, userId: string, siteId?: string): Promise<LabSite | undefined> {
  if (!siteId) return undefined
  const credentials = await getOwnedSiteCredentials(supabase, userId, siteId)
  return { id: siteId, ...credentials }
}

/** Jalankan satu tool secara independen. Error tak terduga diredaksi sebelum dikirim/di-log. */
export async function runLabTool(supabase: SupabaseClient, userId: string, request: LabRunRequest): Promise<LabRunResult> {
  const site = await resolveLabSite(supabase, userId, request.siteId)
  const userKeys = await getUserDecryptedKeys(userId)
  try {
    return await executeLabTool(request.targetId, request.input, site, userKeys, request.signal)
  } catch (err: unknown) {
    throw labExecutionError(err)
  }
}

async function executeLabTool(
  toolId: string,
  input: LabInput,
  site: LabSite | undefined,
  userKeys: DecryptedUserKeys,
  signal: AbortSignal | undefined
): Promise<LabRunResult> {
  const startTime = Date.now()
  const elapsed = () => Date.now() - startTime

  if (toolId === "wordpress_publisher") {
    if (!site) throw badRequest("Situs WordPress yang valid wajib dipilih untuk menguji publisher.")
    // Sengaja tanpa sinyal pembatalan: request pembuatan post yang diputus di tengah bisa saja sudah
    // tersimpan di WordPress (status tidak pasti), jadi dibiarkan selesai.
    const pubResult = await publishPostToWordPress({
      baseUrl: site.baseUrl,
      username: site.username,
      applicationPassword: site.applicationPassword,
      article: {
        title: text(input, "title", "Test Artikel Lab"),
        contentHtml: text(input, "contentHtml", "<p>Uji coba lab</p>"),
        excerpt: text(input, "excerpt"),
      },
      // Draft-first: publish hanya bila dipilih eksplisit di form Lab.
      metadata: { status: oneOf(text(input, "status"), ["draft", "publish"] as const, "draft") },
    })
    const error = redactLabText(pubResult.error)
    return { ok: pubResult.ok, output: { ...pubResult, error }, ...(pubResult.ok ? {} : { error }), durationMs: elapsed() }
  }

  if (toolId === "web_search") {
    const query = text(input, "query")
    const outcome = await webSearch({
      query,
      limit: positiveInt(input, "limit", 4, 20),
      language: text(input, "language", "id"),
      provider: oneOf(
        text(input, "provider", userKeys.searchPreferences?.default_provider || "auto"),
        WEB_SEARCH_PROVIDERS,
        "auto"
      ),
      // Setiap kunci BYOK dikirim terpisah agar hanya sampai ke provider-nya sendiri.
      keys: { tavilyKey: userKeys.tavilyKey, braveKey: userKeys.braveKey, serpapiKey: userKeys.serpapiKey },
      searxngUrl: userKeys.searxngUrl,
      signal,
    })
    if (!outcome.ok) return labToolFailure(outcome, elapsed())
    const results = outcome.data
    const output = { query, totalResults: results.length, results }
    return { ok: true, result: output, output, summary: `Ditemukan ${results.length} sumber referensi web`, durationMs: elapsed() }
  }

  if (toolId === "image_search") {
    const query = text(input, "query")
    const outcome = await searchRoyaltyFreeImages({
      query,
      count: positiveInt(input, "count", 3, 20),
      orientation: "landscape",
      minWidth: positiveInt(input, "minWidth", 1280, 8000),
      provider: oneOf(text(input, "provider", "auto"), IMAGE_SEARCH_PROVIDERS, "auto"),
      pexafyApiKey: userKeys.pexafyKey,
      searxngUrl: userKeys.searxngUrl,
      signal,
    })
    if (!outcome.ok) return labToolFailure(outcome, elapsed())
    const photos = outcome.data
    const output = { query, totalPhotos: photos.length, photos }
    return { ok: true, result: output, output, summary: `Ditemukan ${photos.length} foto berkualitas tinggi`, durationMs: elapsed() }
  }

  if (toolId === "keyword_suggestions") {
    const outcome = await getKeywordSuggestions({
      query: text(input, "query"),
      limit: positiveInt(input, "limit", 15, 50),
      language: text(input, "language", "id"),
      searxngUrl: userKeys.searxngUrl,
      signal,
    })
    if (!outcome.ok) return labToolFailure(outcome, elapsed())
    const output = outcome.data
    return {
      ok: true,
      result: output,
      output,
      summary: `Ditemukan ${output.suggestions.length} saran kata kunci & LSI`,
      durationMs: elapsed(),
    }
  }

  if (toolId === "web_reader") {
    const url = text(input, "url")
    const unit = oneOf(text(input, "unit"), READ_UNITS, "words")
    const bounds = READ_LENGTH_BOUNDS[unit]
    const outcome = await readWebContent({
      url,
      range: {
        unit,
        from: oneOf(text(input, "from"), READ_ORIGINS, "start"),
        offset: Math.max(0, Math.round(Number(input.offset)) || 0),
        length: positiveInt(input, "length", bounds.default, bounds.max),
      },
      signal,
    })
    if (!outcome.ok) return labToolFailure(outcome, elapsed())
    const output = outcome.data
    return {
      ok: true,
      result: output,
      output,
      summary: `Membaca ${output.range.first}-${output.range.last} dari ${output.range.total} ${READ_UNIT_LABELS_ID[unit]} (${output.wordCount} kata total) dari ${output.title || url}`,
      durationMs: elapsed(),
    }
  }

  // Tool lain dari ToolRegistry universal (mis. upload_media, set_featured_image).
  const toolDef = ToolRegistry.get(toolId)
  if (!toolDef) throw notFound(`Tool dengan ID '${toolId}' tidak ditemukan di ToolRegistry.`)

  const toolInstance = toolDef.build({
    userKeys,
    wpCredentials: site
      ? { baseUrl: site.baseUrl, username: site.username, applicationPassword: site.applicationPassword }
      : undefined,
    language: text(input, "language", "id"),
    recorder: new RunRecorder(),
    signal,
  })

  // Dipanggil sebagai tool call agar hasilnya ToolMessage lengkap dengan artifact `ToolOutcome`.
  let message: unknown
  try {
    message = await toolInstance.invoke(
      { type: "tool_call", id: `lab_${toolDef.id}_${startTime}`, name: toolDef.id, args: input },
      { signal }
    )
  } catch (toolErr: unknown) {
    const failure =
      toolErr instanceof ToolInputParsingException
        ? toolFailure("invalid_input", toolErr.message)
        : failureFromError(toolErr)
    return labToolFailure(failure, elapsed())
  }

  const outcome = readToolArtifact(message)
  if (!outcome) throw new Error(`Tool '${toolDef.id}' tidak mengembalikan artifact ToolOutcome.`)
  if (!outcome.ok) return labToolFailure(outcome, elapsed())

  // Tool dibangun dengan kredensial WP & kunci BYOK: properti bernama rahasia disamarkan,
  // sedangkan URL media/konten di keluaran dibiarkan utuh.
  const output = redactSecrets(outcome.data, { scanText: false })
  return { ok: true, result: output, output, summary: toolDef.summarize(outcome), durationMs: elapsed() }
}

export async function runLabAgentProfile(
  supabase: SupabaseClient,
  userId: string,
  request: LabRunRequest
): Promise<LabRunResult> {
  const site = await resolveLabSite(supabase, userId, request.siteId)
  const userKeys = await getUserDecryptedKeys(userId)
  const { input } = request
  const requestedModel = request.model || text(input, "model")
  const startTime = Date.now()
  const stepEvents: AgentStepEvent[] = []

  let result: Awaited<ReturnType<typeof run>>
  try {
    result = await run(
      {
        agentProfileRef: request.targetId,
        content: {
          keyword: text(input, "keyword", "tips optimasi wordpress"),
          brief: text(input, "brief") || undefined,
          style: text(input, "style", "default"),
          language: text(input, "language", "id"),
        },
        site: site
          ? { siteId: site.id, baseUrl: site.baseUrl, username: site.username, applicationPassword: site.applicationPassword }
          : undefined,
        publishing: { mode: text(input, "actionStatus", "draft"), categoryIds: [], tagNames: [] },
        model: requestedModel || undefined,
        // Tanpa `apiKey` di request: runtime memakai userKeys.openrouterKey dari opsi di bawah,
        // sehingga kunci terdekripsi tidak disalin ke payload request.
        userId,
      },
      {
        userId,
        userKeys,
        onEventListener: (event: AgentStepEvent) => stepEvents.push(event),
        abortSignal: request.signal,
      }
    )
  } catch (err: unknown) {
    throw labExecutionError(err)
  }

  // Artikel & enrichment adalah konten: tidak diredaksi. Log eksekusi (nodeLogs memuat
  // request/site/input) dan error diredaksi sebelum dikirim ke browser.
  const execution = redactSecrets({ ...result.execution, stepEvents })
  const agentError = result.error
    ? {
        ...result.error,
        message: redactSecretsInText(result.error.message),
        details: result.error.details ? redactSecrets(result.error.details) : undefined,
      }
    : undefined

  const payload = { article: result.article, enrichment: result.enrichment, execution, error: agentError }
  return {
    ok: result.success,
    result: payload,
    output: payload,
    article: result.article,
    enrichment: result.enrichment,
    execution,
    error: agentError?.message,
    durationMs: Date.now() - startTime,
  }
}
