/**
 * Konfigurasi Global AI Model (Client & Server Fallback)
 * Mengatur Single Source of Truth untuk model default aplikasi.
 * API key tidak pernah disimpan di browser; kunci BYOK hanya tersimpan terenkripsi di server.
 */

export const DEFAULT_AI_MODEL = "google/gemini-2.5-flash"

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
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Default - Cepat & Hemat)", context_length: 1048576, supports_tools: true, supports_reasoning: true },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct (Cepat & Andal)", context_length: 131072, supports_tools: true, supports_reasoning: false },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat & Cerdas)", context_length: 64000, supports_tools: true, supports_reasoning: true },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Editorial Tertinggi)", context_length: 200000, supports_tools: true, supports_reasoning: false },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (Cepat & Stabil)", context_length: 128000, supports_tools: true, supports_reasoning: false },
]

export const AVAILABLE_AI_MODELS = FALLBACK_AI_MODELS

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
