import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import {
  BYOK_KEY_FIELDS,
  type ApiKeysFormValues,
  type ByokKeyField,
  type UpdateUserSettingsInput,
} from "@/lib/validation/settings"
import type { UserSettings } from "@/types/settings"

/** Pemetaan murni data pengaturan ⇄ form Pusat Kunci API (`/settings/keys`). */

const DEFAULT_LANGSMITH_PROJECT = "panitera"

/** Input kunci BYOK selalu mulai kosong: server hanya mengirim status `configured`, tidak pernah nilai kunci. */
export const EMPTY_BYOK_KEYS: Record<ByokKeyField, ""> = {
  openrouterKey: "",
  tavilyKey: "",
  braveKey: "",
  serpapiKey: "",
  pexafyKey: "",
  langsmithApiKey: "",
}

export function toApiKeysFormValues(settings: UserSettings): ApiKeysFormValues {
  return {
    ...EMPTY_BYOK_KEYS,
    defaultAiModel: settings.defaultAiModel || DEFAULT_AI_MODEL,
    reasoningEffort: settings.reasoningEffort ?? settings.searchPreferences.reasoning_effort ?? "low",
    defaultSearchProvider: settings.searchPreferences.default_provider ?? "auto",
    langsmithProject: settings.langsmithProject || DEFAULT_LANGSMITH_PROJECT,
  }
}

/**
 * Body PUT `/api/settings/user` dari form. Hanya kunci yang diketik yang dikirim (kosong = kunci tersimpan tidak
 * berubah; hapus kunci lewat aksi terpisah yang mengirim `""`). Field tanpa input di halaman ini (mis. `searxngUrl`)
 * sengaja tidak dikirim agar nilai tersimpan lama tidak divalidasi ulang dan tidak memblokir penyimpanan.
 */
export function toUserSettingsUpdate(values: ApiKeysFormValues): UpdateUserSettingsInput {
  const update: UpdateUserSettingsInput = {
    defaultAiModel: values.defaultAiModel,
    reasoningEffort: values.reasoningEffort,
    searchPreferences: {
      default_provider: values.defaultSearchProvider,
      default_ai_model: values.defaultAiModel,
      reasoning_effort: values.reasoningEffort,
    },
    langsmithProject: values.langsmithProject.trim() || DEFAULT_LANGSMITH_PROJECT,
  }
  for (const field of BYOK_KEY_FIELDS) {
    const key = values[field].trim()
    if (key) update[field] = key
  }
  return update
}

/** Pesan hasil uji kunci OpenRouter; sisa kuota ditampilkan bila akun punya limit kredit. */
export function describeOpenRouterCheck({ limit, usage }: { limit?: number | null; usage?: number }): string {
  if (typeof limit === "number" && typeof usage === "number") {
    return `Koneksi OpenRouter terverifikasi! Kuota tersisa: $${(limit - usage).toFixed(2)}`
  }
  return "Koneksi OpenRouter terverifikasi!"
}
