import { NextResponse } from "next/server"
import { getSanitizedApiKey } from "@/core/writer"

export interface OpenRouterModelItem {
  id: string
  name: string
  description?: string
  context_length?: number
  pricing?: {
    prompt: string
    completion: string
  }
  top_provider?: {
    max_completion_tokens?: number
    is_moderated?: boolean
  }
  architecture?: {
    modality?: string
    tokenizer?: string
    instruct_type?: string
  }
  supported_parameters?: string[]
  supports_tools: boolean
  supports_reasoning: boolean
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientKey = searchParams.get("apiKey")
    const toolsOnly = searchParams.get("toolsOnly") !== "false" // default: true (hanya tampilkan model yang mendukung tool calling)
    const sanitizedKey = getSanitizedApiKey(clientKey || process.env.OPENROUTER_API_KEY)

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (sanitizedKey) {
      headers["Authorization"] = `Bearer ${sanitizedKey}`
    }

    // Ambil daftar model dari OpenRouter API
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers,
      next: { revalidate: 3600 }, // Cache 1 jam di server Next.js
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Gagal mengambil model dari OpenRouter (Status ${res.status})` },
        { status: res.status }
      )
    }

    interface RawOpenRouterModel {
      id: string
      name?: string
      description?: string
      context_length?: number
      supported_parameters?: string[]
      pricing?: {
        prompt?: string
        completion?: string
      }
      top_provider?: {
        max_completion_tokens?: number
        is_moderated?: boolean
      }
      architecture?: {
        modality?: string
        tokenizer?: string
        instruct_type?: string
      }
    }

    const data = await res.json()
    const rawModels: RawOpenRouterModel[] = Array.isArray(data?.data) ? data.data : []

    // Filter hanya model yang mendukung tool calling jika toolsOnly aktif
    const filteredRawModels = toolsOnly
      ? rawModels.filter((m) => {
          const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : []
          return params.includes("tools") || params.includes("tool_choice")
        })
      : rawModels

    // Petakan dan rapikan format model
    const models: OpenRouterModelItem[] = filteredRawModels.map((m) => {
      const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : []
      const supportsTools = params.includes("tools") || params.includes("tool_choice")
      const supportsReasoning =
        params.includes("reasoning") ||
        params.includes("reasoning_effort") ||
        params.includes("include_reasoning")

      return {
        id: m.id,
        name: m.name || m.id,
        description: m.description,
        context_length: m.context_length,
        pricing: m.pricing
          ? {
              prompt: m.pricing.prompt ?? "0",
              completion: m.pricing.completion ?? "0",
            }
          : undefined,
        top_provider: m.top_provider,
        architecture: m.architecture,
        supported_parameters: params,
        supports_tools: supportsTools,
        supports_reasoning: supportsReasoning,
      }
    })

    return NextResponse.json({
      ok: true,
      count: models.length,
      toolsOnly,
      models,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Kesalahan server saat memuat model"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
