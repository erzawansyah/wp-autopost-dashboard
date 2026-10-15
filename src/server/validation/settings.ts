import { z } from "zod"
import type { WebSearchProvider } from "@/core/shared/tools/web-search"
import type { NotificationPrefs } from "@/types/settings"

/** Skema input route pengaturan pengguna (`/api/settings/**`). */

/**
 * Provider yang benar-benar ditangani `webSearch()` (`@/core/shared/tools/web-search`).
 * Bertipe `Record<WebSearchProvider, true>` agar tsc gagal bila union provider berubah tanpa memperbarui daftar ini.
 */
const SEARCH_PROVIDER_FLAGS: Record<WebSearchProvider, true> = {
  auto: true,
  tavily: true,
  brave: true,
  searxng: true,
  bing_scraper: true,
  serpapi: true,
  open_knowledge: true,
}

const SEARCH_PROVIDERS = Object.keys(SEARCH_PROVIDER_FLAGS) as [WebSearchProvider, ...WebSearchProvider[]]

export const SearchProviderSchema = z.enum(SEARCH_PROVIDERS, {
  error: `Provider pencarian default tidak didukung. Pilih salah satu: ${SEARCH_PROVIDERS.join(", ")}.`,
})

export const ReasoningEffortSchema = z.enum(["low", "medium", "high"], {
  error: "Tingkat reasoning harus low, medium, atau high.",
})

/**
 * Satu-satunya kunci `notification_prefs` yang boleh dibaca/ditulis client (semuanya boolean).
 * Kunci lain di kolom jsonb yang sama — terutama `langsmith_api_key` (terenkripsi) — tidak pernah
 * dikirim ke browser dan tidak bisa ditimpa lewat `notificationPrefs` (kunci asing dibuang zod).
 */
const NotificationPrefsInputSchema = z.object({
  email_on_failure: z.boolean().optional(),
  email_on_batch_complete: z.boolean().optional(),
  notify_on_queue_empty: z.boolean().optional(),
  in_app_toast: z.boolean().optional(),
  developer_mode: z.boolean().optional(),
}) satisfies z.ZodType<NotificationPrefs>

export const CLIENT_NOTIFICATION_PREF_KEYS = NotificationPrefsInputSchema.keyof().options

/** Kunci BYOK dari form: "" = hapus, nilai tersamar (•/*) = tidak berubah, selain itu = kunci baru. */
const ByokKeyInputSchema = z.string().trim().max(1000, "Kunci API terlalu panjang.").optional()

const AiModelInputSchema = z.string().trim().max(200, "ID model AI terlalu panjang.").nullish()

/** PUT /api/settings/user — hanya field yang dikirim yang diperbarui. */
export const UpdateUserSettingsBodySchema = z.object({
  openrouterKey: ByokKeyInputSchema,
  tavilyKey: ByokKeyInputSchema,
  braveKey: ByokKeyInputSchema,
  serpapiKey: ByokKeyInputSchema,
  pexafyKey: ByokKeyInputSchema,
  langsmithApiKey: ByokKeyInputSchema,
  langsmithProject: z.string().trim().max(100, "Nama project LangSmith maksimal 100 karakter.").optional(),
  defaultAiModel: AiModelInputSchema,
  reasoningEffort: ReasoningEffortSchema.optional(),
  /** String kosong/null = kembali ke SearXNG bawaan platform. */
  searxngUrl: z.string().trim().max(2048, "URL SearxNG terlalu panjang.").nullish(),
  searchPreferences: z
    .object({
      default_provider: SearchProviderSchema.optional(),
      default_ai_model: AiModelInputSchema,
      reasoning_effort: ReasoningEffortSchema.optional(),
    })
    .nullish(),
  notificationPrefs: NotificationPrefsInputSchema.optional(),
  developerMode: z.boolean({ error: "developerMode harus boolean." }).optional(),
})
export type UpdateUserSettingsInput = z.infer<typeof UpdateUserSettingsBodySchema>

const SEARCH_TEST_PROVIDER_ERROR = "Provider tidak valid. Pilih antara 'tavily', 'brave', 'searxng', atau 'pexafy'."

/** POST /api/settings/search/test */
export const SearchTestBodySchema = z.discriminatedUnion(
  "provider",
  [
    z.object({
      provider: z.literal("searxng"),
      searxngUrl: z
        .string({ error: "URL instance SearxNG belum diisi." })
        .trim()
        .min(1, "URL instance SearxNG belum diisi.")
        .max(2048, "URL SearxNG terlalu panjang."),
    }),
    z.object({
      provider: z.enum(["tavily", "brave", "pexafy"]),
      apiKey: z
        .string({ error: "Kunci API belum diisi." })
        .trim()
        .min(1, "Kunci API belum diisi.")
        .max(1000, "Kunci API terlalu panjang."),
    }),
  ],
  { error: SEARCH_TEST_PROVIDER_ERROR }
)
export type SearchTestInput = z.infer<typeof SearchTestBodySchema>
