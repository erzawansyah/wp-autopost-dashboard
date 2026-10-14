/**
 * Konfigurasi Global AI Model (Client & Server Fallback)
 * Mengatur Single Source of Truth untuk model default aplikasi.
 * API key tidak pernah disimpan di browser; kunci BYOK hanya tersimpan terenkripsi di server.
 */

export const DEFAULT_AI_MODEL = "meta-llama/llama-3.3-70b-instruct"

export interface OpenRouterModelInfo {
  id: string
  name: string
  description?: string
  context_length?: number
  pricing?: {
    prompt: string
    completion: string
  }
  supported_parameters?: string[]
  supports_tools?: boolean
  supports_reasoning?: boolean
}

export const FALLBACK_AI_MODELS: OpenRouterModelInfo[] = [
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct (Default - Cepat & Andal)", context_length: 131072, supports_tools: true, supports_reasoning: false },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat & Cerdas)", context_length: 64000, supports_tools: true, supports_reasoning: true },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Editorial Tertinggi)", context_length: 200000, supports_tools: true, supports_reasoning: false },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (Cepat & Stabil)", context_length: 128000, supports_tools: true, supports_reasoning: false },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash", context_length: 1048576, supports_tools: true, supports_reasoning: false },
]

export const AVAILABLE_AI_MODELS = FALLBACK_AI_MODELS

/**
 * Mengambil nama model AI yang aktif secara global dari localStorage (client) atau default
 */
export function getGlobalAiModel(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("custom_openrouter_model") || DEFAULT_AI_MODEL
  }
  return process.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_AI_MODEL
}

/**
 * Mengambil nama label model yang mudah dibaca pengguna
 */
export function getModelDisplayName(modelId: string, customModels?: OpenRouterModelInfo[]): string {
  const models = customModels && customModels.length > 0 ? customModels : FALLBACK_AI_MODELS
  const found = models.find((m) => m.id === modelId)
  if (found) return found.name
  // Jika modelId format 'provider/model-name', rapikan
  const parts = modelId.split("/")
  if (parts.length === 2) {
    return `${parts[1]} (${parts[0]})`
  }
  return modelId
}

/** Header untuk mengirim API key yang belum disimpan (uji sebelum simpan). Jangan lewat query string. */
export const UNSAVED_OPENROUTER_KEY_HEADER = "x-openrouter-key"

/**
 * Fetch daftar model dinamis dari endpoint /api/ai/models.
 * Server memakai API key OpenRouter milik pengguna yang tersimpan; `unsavedKey` opsional
 * (mis. kunci yang baru diketik dan belum disimpan) dikirim lewat header, bukan query string.
 */
export async function fetchDynamicAiModels(options?: { unsavedKey?: string }): Promise<OpenRouterModelInfo[]> {
  try {
    const headers: Record<string, string> = {}
    const unsavedKey = options?.unsavedKey?.trim()
    // Lewati nilai tersamar (•/*) atau non-ASCII: bukan kunci asli dan tidak valid sebagai header.
    if (unsavedKey && /^[\x21-\x7E]+$/.test(unsavedKey) && !unsavedKey.includes("*")) {
      headers[UNSAVED_OPENROUTER_KEY_HEADER] = unsavedKey
    }
    const res = await fetch("/api/ai/models", { headers, cache: "no-store" })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data = await res.json()
    if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
      return data.models
    }
    return FALLBACK_AI_MODELS
  } catch (err) {
    console.warn("Gagal memuat model dinamis dari OpenRouter, menggunakan fallback:", err)
    return FALLBACK_AI_MODELS
  }
}
