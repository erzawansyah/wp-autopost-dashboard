import { z } from "zod"
import type { SearchPreferences } from "@/types/settings"

/**
 * Skema input pengaturan pengguna (`/api/settings/**`) — dipakai bersama form client (`/settings/keys`,
 * `/settings/profile`) dan route API. Validasi URL SearXNG kustom (anti-SSRF + DNS) tetap di service server
 * (`src/server/services/settings.ts`); di sini cukup bentuk & batas panjang.
 */

export type SearchProvider = NonNullable<SearchPreferences["default_provider"]>

/**
 * Provider yang ditangani `webSearch()`. Bertipe `Record<SearchProvider, true>` agar tsc gagal bila union
 * berubah tanpa memperbarui daftar ini; kesetaraan dengan `WebSearchProvider` dijaga test tipe di `settings.test.ts`.
 */
const SEARCH_PROVIDER_FLAGS: Record<SearchProvider, true> = {
  auto: true,
  tavily: true,
  brave: true,
  searxng: true,
  bing_scraper: true,
  serpapi: true,
  open_knowledge: true,
}

export const SEARCH_PROVIDERS = Object.keys(SEARCH_PROVIDER_FLAGS) as [SearchProvider, ...SearchProvider[]]

export const SearchProviderSchema = z.enum(SEARCH_PROVIDERS, {
  error: `Provider pencarian default tidak didukung. Pilih salah satu: ${SEARCH_PROVIDERS.join(", ")}.`,
})

export const ReasoningEffortSchema = z.enum(["low", "medium", "high"], {
  error: "Tingkat reasoning harus low, medium, atau high.",
})

/**
 * Pilihan form "Ikuti Agent Profile": akun tidak menetapkan tingkat penalaran sehingga preset memakai nilai
 * bawaannya. Disimpan sebagai ketiadaan nilai (`reasoningEffort: null` di body PUT), bukan string ini.
 */
export const FOLLOW_PROFILE_REASONING = "profile"

/** Tingkat penalaran akun di body PUT: `null` = hapus (ikuti Agent Profile). */
const AccountReasoningEffortInputSchema = ReasoningEffortSchema.nullable().optional()

/** Kunci BYOK di body PUT: "" = hapus, nilai tersamar (•/*) = tidak berubah, selain itu = kunci baru. */
const ByokKeyInputSchema = z.string().trim().max(1000, "Kunci API terlalu panjang.").optional()

const AiModelInputSchema = z.string().trim().max(200, "ID model AI terlalu panjang.").nullish()

const LangsmithProjectSchema = z.string().trim().max(100, "Nama project LangSmith maksimal 100 karakter.")

/**
 * PUT /api/settings/user — hanya field yang dikirim yang diperbarui. Satu-satunya isi `notification_prefs` yang
 * boleh ditulis client adalah `developerMode` (→ `developer_mode`); kunci tak dikenal (mis. `notificationPrefs`
 * dari klien lama) dibuang zod, sehingga `langsmith_api_key` terenkripsi di jsonb yang sama tidak bisa ditimpa.
 */
export const UpdateUserSettingsBodySchema = z.object({
  openrouterKey: ByokKeyInputSchema,
  tavilyKey: ByokKeyInputSchema,
  braveKey: ByokKeyInputSchema,
  serpapiKey: ByokKeyInputSchema,
  pexafyKey: ByokKeyInputSchema,
  langsmithApiKey: ByokKeyInputSchema,
  langsmithProject: LangsmithProjectSchema.optional(),
  defaultAiModel: AiModelInputSchema,
  reasoningEffort: AccountReasoningEffortInputSchema,
  /** String kosong/null = kembali ke SearXNG bawaan platform. */
  searxngUrl: z.string().trim().max(2048, "URL SearxNG terlalu panjang.").nullish(),
  searchPreferences: z
    .object({
      default_provider: SearchProviderSchema.optional(),
      default_ai_model: AiModelInputSchema,
      reasoning_effort: AccountReasoningEffortInputSchema,
    })
    .nullish(),
  developerMode: z.boolean({ error: "developerMode harus boolean." }).optional(),
})
export type UpdateUserSettingsInput = z.infer<typeof UpdateUserSettingsBodySchema>

const SEARCH_TEST_PROVIDER_ERROR =
  "Provider tidak valid. Pilih antara 'tavily', 'brave', 'serpapi', 'searxng', atau 'pexafy'."

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
      provider: z.enum(["tavily", "brave", "serpapi", "pexafy"]),
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
export type SearchTestProvider = SearchTestInput["provider"]

// ---------------------------------------------------------------------------
// Form client
// ---------------------------------------------------------------------------

/** Field kunci BYOK di form Pusat Kunci API (nama = field body PUT `/api/settings/user`). */
export const BYOK_KEY_FIELDS = [
  "openrouterKey",
  "tavilyKey",
  "braveKey",
  "serpapiKey",
  "pexafyKey",
  "langsmithApiKey",
] as const
export type ByokKeyField = (typeof BYOK_KEY_FIELDS)[number]

/**
 * Kunci yang sedang diketik: kosong = kunci tersimpan tidak berubah (hapus kunci lewat aksi terpisah).
 * Karakter tersamar ditolak agar tidak diam-diam diabaikan server (nilai tersamar = "tidak berubah").
 */
const NewByokKeySchema = z
  .string()
  .trim()
  .max(1000, "Kunci API terlalu panjang.")
  .refine((value) => !/[•*]/.test(value), "Kunci API tidak boleh memuat karakter tersamar (• atau *).")

/** Form `/settings/keys` (kunci BYOK + preferensi model, pencarian, dan LangSmith). */
export const ApiKeysFormSchema = z.object({
  openrouterKey: NewByokKeySchema,
  tavilyKey: NewByokKeySchema,
  braveKey: NewByokKeySchema,
  serpapiKey: NewByokKeySchema,
  pexafyKey: NewByokKeySchema,
  langsmithApiKey: NewByokKeySchema,
  defaultAiModel: z.string().trim().min(1, "Pilih model AI default.").max(200, "ID model AI terlalu panjang."),
  reasoningEffort: z.enum([FOLLOW_PROFILE_REASONING, ...ReasoningEffortSchema.options], {
    error: "Pilih tingkat penalaran.",
  }),
  defaultSearchProvider: SearchProviderSchema,
  langsmithProject: LangsmithProjectSchema,
})
export type ApiKeysFormValues = z.infer<typeof ApiKeysFormSchema>

/** Form `/settings/profile`: Developer Mode (disimpan di server, `notification_prefs.developer_mode`). */
export const ProfilePreferencesFormSchema = z.object({
  developerMode: z.boolean(),
})
export type ProfilePreferencesFormValues = z.infer<typeof ProfilePreferencesFormSchema>
