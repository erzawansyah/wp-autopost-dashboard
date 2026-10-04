/**
 * Konfigurasi Global AI Model & API Key (Client & Server Fallback)
 * Mengatur Single Source of Truth untuk model default aplikasi.
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
}

export const FALLBACK_AI_MODELS: OpenRouterModelInfo[] = [
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct (Default - Cepat & Andal)", context_length: 131072 },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat & Cerdas)", context_length: 64000 },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Editorial Tertinggi)", context_length: 200000 },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (Cepat & Stabil)", context_length: 128000 },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash", context_length: 1048576 },
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

/**
 * Mengambil custom OpenRouter API Key dari localStorage jika disimpan oleh user
 */
export function getGlobalApiKey(): string | undefined {
  if (typeof window !== "undefined") {
    return localStorage.getItem("custom_openrouter_api_key") || undefined
  }
  return undefined
}

/**
 * Fetch daftar model dinamis dari endpoint /api/ai/models
 */
export async function fetchDynamicAiModels(apiKey?: string): Promise<OpenRouterModelInfo[]> {
  try {
    const url = apiKey ? `/api/ai/models?apiKey=${encodeURIComponent(apiKey)}` : `/api/ai/models`
    const res = await fetch(url)
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
