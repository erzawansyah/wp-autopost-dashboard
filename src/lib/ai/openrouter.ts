import fs from "fs"
import path from "path"
import { ChatOpenRouter, OpenRouterAuthError, OpenRouterRateLimitError } from "@langchain/openrouter"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { z } from "zod"
import { DEFAULT_AI_MODEL } from "./settings"

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
  if (customApiKey && customApiKey.trim()) {
    return customApiKey.trim().replace(/^["']|["']$/g, "")
  }

  let rawKey = process.env.OPENROUTER_API_KEY || ""

  // Jika di server Node.js lokal, baca langsung berkas .env agar perubahan kunci langsung aktif tanpa perlu me-restart server
  if (typeof window === "undefined") {
    try {
      const envPath = path.resolve(process.cwd(), ".env")
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8")
        const match = content.match(/^OPENROUTER_API_KEY\s*=\s*(.+)$/m)
        if (match && match[1]) {
          rawKey = match[1].trim()
        }
      }
    } catch {
      // Abaikan jika fs tidak dapat diakses
    }
  }

  return rawKey.trim().replace(/^["']|["']$/g, "")
}

export class OpenRouterLlmService implements LlmServiceInterface {
  private apiKey: string
  private defaultModel: string

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = getSanitizedApiKey(apiKey)
    this.defaultModel = defaultModel || process.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_AI_MODEL
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
      modelKwargs: { reasoning: { max_tokens: 1000 } },
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
