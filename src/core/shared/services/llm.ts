import { ChatOpenRouter, OpenRouterAuthError, OpenRouterRateLimitError } from "@langchain/openrouter"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { z } from "zod"

export interface LlmServiceInterface {
  generate(params: {
    systemPrompt: string
    userPrompt: string
    model?: string
    temperature?: number
    outputSchema?: z.ZodTypeAny
    maxTokens?: number
  }): Promise<{ content: string; tokenUsage: { prompt: number; completion: number; total: number } }>
}

export function getSanitizedApiKey(customApiKey?: string): string {
  const rawKey = customApiKey || process.env.OPENROUTER_API_KEY || ""
  return rawKey.trim().replace(/^["']|["']$/g, "")
}

export class OpenRouterLlmService implements LlmServiceInterface {
  private apiKey: string
  private defaultModel: string

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = getSanitizedApiKey(apiKey)
    this.defaultModel = defaultModel || process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-oss-120b"
  }

  async generate(params: {
    systemPrompt: string
    userPrompt: string
    model?: string
    temperature?: number
    outputSchema?: z.ZodTypeAny
    maxTokens?: number
  }): Promise<{ content: string; tokenUsage: { prompt: number; completion: number; total: number } }> {
    if (!this.apiKey) {
      throw new Error(
        "Kunci API OpenRouter belum dikonfigurasi. Harap masukkan API Key di file .env (OPENROUTER_API_KEY) atau di menu Pengaturan AI."
      )
    }

    const selectedModel = params.model || this.defaultModel
    const chatModel = new ChatOpenRouter({
      apiKey: this.apiKey,
      model: selectedModel,
      temperature: params.temperature ?? 0.7,
      maxTokens: params.maxTokens,
      siteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      siteName: process.env.OPENROUTER_APP_NAME || "WP Autopost Dashboard",
    })

    const messages = [
      new SystemMessage(params.systemPrompt),
      new HumanMessage(params.userPrompt),
    ]

    try {
      // 1. Coba Structured Output jika outputSchema disediakan
      if (params.outputSchema) {
        try {
          const structuredModel = chatModel.withStructuredOutput(params.outputSchema)
          const result = await structuredModel.invoke(messages)
          return {
            content: typeof result === "string" ? result : JSON.stringify(result),
            tokenUsage: { prompt: 0, completion: 0, total: 0 },
          }
        } catch {
          // Fallback ke pemanggilan standar jika provider model tidak mendukung tool calling/schema
        }
      }

      // 2. Pemanggilan standar
      const response = await chatModel.invoke(messages)
      const rawContent =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
          ? response.content.map((c) => (typeof c === "string" ? c : JSON.stringify(c))).join("\n")
          : String(response.content)

      return {
        content: rawContent,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
      }
    } catch (err: unknown) {
      if (
        err instanceof OpenRouterAuthError ||
        String(err).includes("401") ||
        String(err).toLowerCase().includes("user not found")
      ) {
        throw new Error(
          "Kunci API OpenRouter tidak valid atau ditolak oleh server (Error 401). Silakan periksa kembali API Key Anda di Pengaturan AI."
        )
      }
      if (
        err instanceof OpenRouterRateLimitError ||
        String(err).includes("402") ||
        String(err).toLowerCase().includes("insufficient_quota")
      ) {
        throw new Error(
          "Saldo kredit akun OpenRouter Anda tidak mencukupi untuk memproses permintaan model ini."
        )
      }
      const message = err instanceof Error ? err.message : "Kesalahan koneksi ke LangChain OpenRouter"
      throw new Error(`Gagal menghubungi model AI: ${message}`)
    }
  }
}
