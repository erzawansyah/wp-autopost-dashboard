import { DEFAULT_AI_MODEL } from "./settings"
import { getOpenRouterReasoningConfig, ReasoningEffort } from "./reasoning"
import { requireOpenRouterKey } from "./platform-keys"
import { serverEnv } from "@/lib/env/server"

export interface CallAiJsonParams {
  apiKey?: string
  model?: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  jsonSchema?: Record<string, unknown>
  reasoningEffort?: ReasoningEffort
}

/**
 * Utilitas pemanggilan OpenRouter API dengan keluaran JSON terstruktur
 * Mendukung Native JSON Schema (Constrained Decoding) serta graceful fallback ke json_object
 */
export async function callOpenRouterJson<T = unknown>(params: CallAiJsonParams): Promise<T> {
  // BYOK: kunci pengguna; kunci platform hanya bila PLATFORM_KEY_ALLOWED=true.
  const apiKey = requireOpenRouterKey(params.apiKey)

  const model = params.model || serverEnv().DEFAULT_AI_MODEL || DEFAULT_AI_MODEL

  const responseFormat = params.jsonSchema
    ? {
        type: "json_schema",
        json_schema: {
          name: "output_response",
          strict: true,
          schema: params.jsonSchema,
        },
      }
    : { type: "json_object" }

  let res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      reasoning: getOpenRouterReasoningConfig(params.reasoningEffort || "low"),
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
      response_format: responseFormat,
    }),
    signal: AbortSignal.timeout(35000),
  })

  // Jika model penyedia tertentu tidak mendukung response_format json_schema, fallback otomatis ke json_object
  if (!res.ok && params.jsonSchema && res.status === 400) {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        reasoning: getOpenRouterReasoningConfig(params.reasoningEffort || "low"),
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
  }

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
  } catch {
    console.error("[callOpenRouterJson] Gagal mem-parse respons AI ke JSON. Raw:", rawContent)
    throw new Error("Format respons AI tidak valid sebagai JSON.")
  }
}
