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
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientKey = searchParams.get("apiKey")
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

    const data = await res.json()
    const rawModels: any[] = Array.isArray(data?.data) ? data.data : []

    // Petakan dan rapikan format model
    const models: OpenRouterModelItem[] = rawModels.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      description: m.description,
      context_length: m.context_length,
      pricing: m.pricing
        ? {
            prompt: m.pricing.prompt,
            completion: m.pricing.completion,
          }
        : undefined,
      top_provider: m.top_provider,
      architecture: m.architecture,
    }))

    return NextResponse.json({
      ok: true,
      count: models.length,
      models,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Kesalahan server saat memuat model"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
