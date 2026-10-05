/**
 * Utilitas Konfigurasi Reasoning OpenRouter
 * Mengatur level penalaran (low, medium, high) secara fleksibel dan kompatibel
 * lintas provider (OpenAI, Anthropic, Qwen, DeepSeek, Space Bunny, dsb).
 */

export type ReasoningEffort = "low" | "medium" | "high"

export interface OpenRouterReasoningPayload {
  effort: ReasoningEffort
}

/**
 * Menghasilkan objek konfigurasi reasoning standar OpenRouter berdasarkan level yang dipilih.
 * - 'low': Hemat token & cepat, ideal untuk 1-shot writer & topik umum.
 * - 'medium': Seimbang, ideal untuk jurnalis riset & Deep Agent investigasi.
 * - 'high': Maksimal / Unlimited reasoning untuk analisis kompleks bertingkat.
 */
export function getOpenRouterReasoningConfig(
  effort?: ReasoningEffort | string | null
): OpenRouterReasoningPayload {
  if (effort === "high") {
    return { effort: "high" }
  }
  if (effort === "medium") {
    return { effort: "medium" }
  }
  return { effort: "low" }
}

export const REASONING_EFFORT_OPTIONS: Array<{
  value: ReasoningEffort
  label: string
  description: string
}> = [
  {
    value: "low",
    label: "Low (Hemat & Cepat)",
    description: "Penalaran ringkas dan efisien. Menghemat token dan waktu generasi (disarankan untuk artikel standar).",
  },
  {
    value: "medium",
    label: "Medium (Seimbang)",
    description: "Penalaran moderat untuk riset mendalam dan pembagian subbab komprehensif.",
  },
  {
    value: "high",
    label: "High (Maksimal / Unlimited)",
    description: "Penalaran intensif tanpa batas ketat untuk analisis teknis, investigasi rumit, dan sintesis data besar.",
  },
]
