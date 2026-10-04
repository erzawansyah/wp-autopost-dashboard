import { DEFAULT_AI_MODEL } from "./settings"

export interface CallAiJsonParams {
  apiKey?: string
  model?: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
}

/**
 * Utilitas pemanggilan OpenRouter API dengan keluaran JSON terstruktur
 */
export async function callOpenRouterJson<T = unknown>(params: CallAiJsonParams): Promise<T> {
  const apiKey = (params.apiKey || process.env.OPENROUTER_API_KEY || "").trim()
  if (!apiKey) {
    throw new Error("OpenRouter API Key belum dikonfigurasikan di sistem atau pengaturan pengguna.")
  }

  const model = params.model || process.env.DEFAULT_AI_MODEL || DEFAULT_AI_MODEL

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://wp-autopost-dashboard.local",
      "X-Title": "WP Autopost Dashboard",
    },
    body: JSON.stringify({
      model,
      temperature: params.temperature ?? 0.4,
      messages: [
        {
          role: "system",
          content: `${params.systemPrompt}\n\nIMPORTANT: Keluarkan HANYA raw JSON murni tanpa pembuka/penutup kata atau penjelasan di luar JSON.`,
        },
        {
          role: "user",
          content: params.userPrompt,
        },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(35000),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const msg = errorData?.error?.message || `Server AI merespons status ${res.status}`
    throw new Error(`Gagal memanggil AI: ${msg}`)
  }

  const data = await res.json()
  const rawContent = data?.choices?.[0]?.message?.content || ""

  // Parse JSON dengan pembersihan markdown fence jika ada
  let cleaned = rawContent.trim()
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  }

  try {
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.error("[callOpenRouterJson] Gagal mem-parse respons AI ke JSON. Raw:", rawContent)
    throw new Error("Format respons AI tidak valid sebagai JSON.")
  }
}
