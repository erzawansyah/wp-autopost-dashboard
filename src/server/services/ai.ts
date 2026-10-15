import "server-only"
import { ApiError, badRequest, upstreamFailed } from "@/server/http/errors"

/**
 * Layanan katalog & verifikasi kunci OpenRouter untuk `/api/ai/*`.
 * Pemanggil menentukan kunci (BYOK atau header kunci belum tersimpan); kunci platform tidak pernah dipakai di sini.
 * Tujuan fetch tetap (openrouter.ai), bukan URL dari pengguna/LLM.
 */

interface RawOpenRouterModel {
  id: string
  name?: string
  description?: string
  context_length?: number
  supported_parameters?: string[]
  pricing?: { prompt?: string; completion?: string }
  top_provider?: { max_completion_tokens?: number; is_moderated?: boolean }
  architecture?: { modality?: string; tokenizer?: string; instruct_type?: string }
}

/** Bentuk item model di respons (dibaca `fetchDynamicAiModels` di `src/lib/ai/settings.ts`). */
export interface OpenRouterModelItem {
  id: string
  name: string
  description?: string
  context_length?: number
  pricing?: { prompt: string; completion: string }
  top_provider?: RawOpenRouterModel["top_provider"]
  architecture?: RawOpenRouterModel["architecture"]
  supported_parameters?: string[]
  supports_tools: boolean
  supports_reasoning: boolean
}

export interface OpenRouterKeySummary {
  label: string
  limit?: number | null
  usage?: number
  isFreeTier?: boolean
}

function toModelItem(model: RawOpenRouterModel): OpenRouterModelItem {
  const params = Array.isArray(model.supported_parameters) ? model.supported_parameters : []
  return {
    id: model.id,
    name: model.name || model.id,
    description: model.description,
    context_length: model.context_length,
    pricing: model.pricing
      ? { prompt: model.pricing.prompt ?? "0", completion: model.pricing.completion ?? "0" }
      : undefined,
    top_provider: model.top_provider,
    architecture: model.architecture,
    supported_parameters: params,
    supports_tools: params.includes("tools") || params.includes("tool_choice"),
    supports_reasoning:
      params.includes("reasoning") || params.includes("reasoning_effort") || params.includes("include_reasoning"),
  }
}

/** Katalog model OpenRouter; tanpa kunci tetap bisa dimuat (katalog publik). */
export async function listOpenRouterModels(apiKey: string | undefined, toolsOnly: boolean): Promise<OpenRouterModelItem[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  let res: Response
  try {
    res = await fetch("https://openrouter.ai/api/v1/models", {
      headers,
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 3600 }, // Cache 1 jam di server Next.js
    })
  } catch (err: unknown) {
    throw new ApiError(502, "upstream_failed", "Gagal menghubungi OpenRouter untuk memuat daftar model.", {
      cause: err,
    })
  }
  if (!res.ok) throw upstreamFailed(`Gagal mengambil model dari OpenRouter (Status ${res.status}).`)

  const data = (await res.json().catch(() => null)) as { data?: unknown } | null
  const rawModels = (Array.isArray(data?.data) ? data.data : []) as RawOpenRouterModel[]
  return rawModels
    .filter((model) => typeof model?.id === "string")
    .map(toModelItem)
    .filter((model) => !toolsOnly || model.supports_tools)
}

/** Verifikasi kunci OpenRouter; kunci ditolak → 400 (bukan 401 agar tidak disangka sesi habis). */
export async function verifyOpenRouterKey(apiKey: string): Promise<OpenRouterKeySummary> {
  let res: Response
  try {
    res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err: unknown) {
    throw new ApiError(502, "upstream_failed", "Gagal menghubungi OpenRouter. Coba lagi beberapa saat lagi.", {
      cause: err,
    })
  }

  if (res.status === 401) {
    throw badRequest("Kunci API ditolak (Status 401: User not found). Pastikan API Key valid dari https://openrouter.ai/keys")
  }
  if (!res.ok) throw upstreamFailed(`Server OpenRouter merespons status HTTP ${res.status}.`)

  const data = (await res.json().catch(() => null)) as {
    data?: { label?: string; limit?: number | null; usage?: number; is_free_tier?: boolean }
  } | null
  return {
    label: data?.data?.label || "OpenRouter API Key",
    limit: data?.data?.limit,
    usage: data?.data?.usage,
    isFreeTier: data?.data?.is_free_tier,
  }
}
