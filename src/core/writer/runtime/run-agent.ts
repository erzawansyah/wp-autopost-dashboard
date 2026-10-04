import { ChatOpenRouter } from "@langchain/openrouter"
import { HumanMessage } from "@langchain/core/messages"
import { getSanitizedApiKey } from "@/lib/ai/openrouter"
import { DecryptedUserKeys } from "@/types/settings"
import {
  WriterRequest,
  GeneratedArticle,
  ArticleSource,
  WpEnrichment,
  WriterError,
} from "../types/contracts"
import { AgentProfile, clampLimits, ALL_MANDATORY_TOOL_IDS } from "../types/profile"
import { RunRecorder, AgentStepEvent } from "./telemetry"
import { checkToolEligibility } from "../tools/eligibility"
import { ToolRegistry } from "../tools/registry"
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder"
import { buildWriterAgent } from "./build-agent"
import { executeSingleFinalizeCall } from "./finalize"
import { postprocessArticle } from "./postprocess"
import { extractArticleJsonFromText, ArticleOutput } from "./output-schema"
import { preResolveTaxonomyAndAuthor } from "./pre-resolve"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { getLanguageDisplayName } from "@/lib/constants/languages"
import "../tools" // Pastikan seluruh tool terdaftar ke registry

export interface RunAgentOptions {
  request: WriterRequest
  profile: AgentProfile
  userKeys: DecryptedUserKeys
  onEventListener?: (event: AgentStepEvent) => void
  abortSignal?: AbortSignal
}

export interface RunAgentResult {
  success: boolean
  article?: GeneratedArticle
  sources: ArticleSource[]
  enrichment: WpEnrichment
  recorder: RunRecorder
  stopReason: string
  error?: WriterError
}

export async function runAgentWriter(options: RunAgentOptions): Promise<RunAgentResult> {
  const { request, userKeys, onEventListener, abortSignal } = options
  const profile = {
    ...options.profile,
    limits: clampLimits(options.profile.limits, options.profile.mode),
  }

  const recorder = new RunRecorder(onEventListener)
  const limits = profile.limits
  const keyword = request.content.keyword
  const language = request.content.language || "id"
  const targetWordCount = request.content.wordCountTarget || limits.minWordCount || 800

  // 1. Kredensial WordPress
  const site = request.site
  const wpCredentials =
    site?.baseUrl && site?.username && site?.applicationPassword
      ? {
          baseUrl: site.baseUrl,
          username: site.username,
          applicationPassword: site.applicationPassword,
        }
      : undefined

  // 2. Evaluasi kelayakan tool (Eligibility Guard)
  // Tool WordPress inti selalu built-in aktif secara otomatis pada setiap agent
  const effectiveToolIds = Array.from(
    new Set([...(profile.toolIds || []), ...ALL_MANDATORY_TOOL_IDS])
  )
  const eligibility = checkToolEligibility(effectiveToolIds, userKeys, wpCredentials)

  // Catat tool yang diblokir sebagai event guard
  for (const blocked of eligibility.blockedTools) {
    recorder.recordEvent({
      kind: "guard",
      tool: blocked.id,
      status: "blocked",
      durationMs: 1,
      summary: `Tool '${blocked.id}' dilewati: ${blocked.reason}`,
    })
  }

  // Bangun instance tool yang memenuhi syarat
  const activeTools = eligibility.eligibleToolIds
    .map((id) => {
      const def = ToolRegistry.get(id)
      if (!def) return null
      return def.build({
        userKeys,
        wpCredentials,
        language,
        recorder,
      })
    })
    .filter(Boolean) as any[]

  // 3. Inisialisasi Kredensial AI & Validasi API Key
  const resolvedApiKey =
    request.apiKey ||
    userKeys.openrouterKey ||
    getSanitizedApiKey()

  if (!resolvedApiKey) {
    const errorMsg =
      "API Key OpenRouter belum dikonfigurasi. Karena platform Panitera menggunakan sistem BYOK (Bring Your Own Key), silakan tambahkan API Key Anda di menu Pengaturan ➔ Kunci API (/settings/keys)."
    recorder.recordEvent({
      kind: "guard",
      status: "error",
      durationMs: 0,
      summary: errorMsg,
    })
    return {
      success: false,
      sources: [],
      enrichment: { categories: [], tags: [] },
      recorder,
      stopReason: "missing_api_key",
      error: {
        code: "MISSING_API_KEY",
        message: errorMsg,
        node: "llm_initialization",
        retryable: false,
      },
    }
  }

  const selectedModel = profile.model || request.model || DEFAULT_AI_MODEL

  // 4. Pre-Resolution: Resolusi Taksonomi & Author WordPress di latar belakang via LLM
  const preResolved = await preResolveTaxonomyAndAuthor({
    wpCredentials,
    requestedAuthorId: request.publishing.authorId,
    requestedCategoryIds: request.publishing.categoryIds,
    requestedTagNames: request.publishing.tagNames,
    keyword,
    language,
    brief: request.content.brief,
    apiKey: resolvedApiKey,
    model: selectedModel,
    recorder,
  })
  const llm = new ChatOpenRouter({
    apiKey: resolvedApiKey,
    model: selectedModel,
    temperature: profile.temperature ?? 0.35,
    maxTokens: 4096,
    siteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    siteName: process.env.OPENROUTER_APP_NAME || "Panitera",
  })

  // 5. Prompting
  let siteUrl = request.site?.baseUrl || ""
  let siteName = request.site?.siteName || ""
  if (!siteName && siteUrl) {
    try {
      const parsed = new URL(siteUrl)
      siteName = parsed.hostname.replace(/^www\./, "")
    } catch {}
  }

  const systemPrompt = buildSystemPrompt(profile.workflowPrompt, {
    siteName,
    siteUrl,
    authorName: preResolved.author?.name,
    authorBio: preResolved.author?.bio,
    categoryName: preResolved.categoryNames.length > 0 ? preResolved.categoryNames.join(", ") : undefined,
    language: getLanguageDisplayName(language),
  })
  const userPromptText = buildUserPrompt({
    keyword,
    title: request.content.title,
    language,
    wordCountTarget: targetWordCount,
    brief: request.content.brief,
    author: preResolved.author ? { name: preResolved.author.name, bio: preResolved.author.bio } : undefined,
    categoryName: preResolved.categoryNames.length > 0 ? preResolved.categoryNames.join(", ") : undefined,
    tagsList: preResolved.tagNames.length > 0 ? preResolved.tagNames.join(", ") : undefined,
    customInstructions: request.customInstructions,
  })

  // 5. Bangun Writer Agent
  let agent: any
  try {
    agent = await buildWriterAgent({
      mode: profile.mode,
      model: llm,
      tools: activeTools,
      systemPrompt,
      limits,
      recorder,
      skills: profile.skills,
    })
  } catch (agentBuildErr: unknown) {
    const errText = agentBuildErr instanceof Error ? agentBuildErr.message : String(agentBuildErr)
    recorder.recordEvent({
      kind: "guard",
      status: "error",
      durationMs: 1,
      summary: `Gagal menginisialisasi agent: ${errText}`,
    })
    return {
      success: false,
      sources: [],
      enrichment: { categories: [], tags: [] },
      recorder,
      stopReason: "agent_build_failed",
      error: {
        code: "AGENT_BUILD_FAILED",
        message: `Gagal membangun agent: ${errText}`,
        retryable: false,
      },
    }
  }

  // 6. Timeout Controller
  const timeoutMs = limits.timeoutSeconds * 1000
  const timeoutController = new AbortController()
  const timer = setTimeout(() => {
    timeoutController.abort()
  }, timeoutMs)

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => timeoutController.abort(), { once: true })
  }

  let rawOutput: Partial<ArticleOutput> | null = null
  let stopReason = "completed"
  const threadId = `agent-run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

  // 7. Eksekusi Agent Loop
  try {
    const agentResult = await agent.invoke(
      {
        messages: [new HumanMessage(userPromptText)],
      },
      {
        configurable: { thread_id: threadId },
        recursionLimit: Math.min(100, limits.maxModelCalls * 2 + 10),
        signal: timeoutController.signal,
      }
    )

    clearTimeout(timer)

    // Periksa apakah model mengembalikan structured response langsung
    if (agentResult.structuredResponse) {
      rawOutput = agentResult.structuredResponse
    } else {
      // Ambil pesan terakhir dan ekstrak teks secara bersih (menghindari double JSON stringify)
      const messages = agentResult.messages || []
      const lastMsg = messages[messages.length - 1]

      const extractRawMessageText = (content: unknown): string => {
        if (typeof content === "string") return content
        if (Array.isArray(content)) {
          return content
            .map((part) => {
              if (typeof part === "string") return part
              if (
                typeof part === "object" &&
                part !== null &&
                "text" in part &&
                typeof (part as any).text === "string"
              ) {
                return (part as any).text
              }
              return ""
            })
            .filter(Boolean)
            .join("\n\n")
        }
        return ""
      }

      const rawText = extractRawMessageText(lastMsg?.content)

      rawOutput = extractArticleJsonFromText(rawText)
      if (!rawOutput?.markdownContent && rawText.length > 200) {
        const unescaped = rawText.includes("\\n")
          ? rawText.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
          : rawText
        rawOutput = {
          title: request.content.title || `Panduan Lengkap ${keyword}`,
          excerpt: `Ulasan terpercaya mengenai ${keyword}.`,
          markdownContent: unescaped,
        }
      }
    }
  } catch (invokeErr: unknown) {
    clearTimeout(timer)
    const errText = invokeErr instanceof Error ? invokeErr.message : String(invokeErr)
    const isTimeout = timeoutController.signal.aborted || errText.includes("abort") || errText.includes("timeout")
    const isLimit =
      errText.includes("ModelCallLimitMiddlewareError") ||
      errText.includes("ToolCallLimitExceededError") ||
      errText.includes("recursionLimit")

    stopReason = isTimeout
      ? "timeout_exceeded"
      : isLimit
      ? "limit_reached"
      : "agent_loop_interrupted"

    recorder.recordEvent({
      kind: "guard",
      status: "blocked",
      durationMs: 1,
      summary: `Eksekusi agent terhenti (${stopReason}): ${errText.slice(0, 120)}`,
    })
  }

  // 8. Evaluasi Kelengkapan Naskah & Trigger Single Finalize Call jika diperlukan
  const rawWords = rawOutput?.markdownContent
    ? rawOutput.markdownContent.split(/\s+/).filter(Boolean).length
    : 0

  const needsFinalize =
    !rawOutput?.markdownContent ||
    rawWords < Math.max(250, Math.round(limits.minWordCount * 0.6))

  if (needsFinalize) {
    console.log(
      `[runAgentWriter] Naskah belum lengkap (${rawWords} kata, stopReason: ${stopReason}). Menjalankan Single Finalize Call...`
    )

    const finalizeResult = await executeSingleFinalizeCall({
      llm,
      systemPrompt,
      keyword,
      language,
      targetWordCount,
      brief: request.content.brief,
      author: preResolved.author ? { name: preResolved.author.name, bio: preResolved.author.bio } : undefined,
      customInstructions: request.customInstructions,
      recorder,
      reason: stopReason,
    })

    if (finalizeResult && finalizeResult.markdownContent) {
      rawOutput = finalizeResult
      stopReason = stopReason === "completed" ? "finalized_after_short_draft" : `finalized_after_${stopReason}`
    }
  }

  // 9. Hasil Akhir
  if (!rawOutput?.markdownContent || rawOutput.markdownContent.length < 200) {
    const finalErrorMsg = `Agent gagal menghasilkan naskah artikel yang memenuhi kriteria (${stopReason}).`
    recorder.recordEvent({
      kind: "summary",
      status: "error",
      durationMs: 1,
      summary: finalErrorMsg,
    })

    return {
      success: false,
      sources: Array.from(recorder.sources.values()),
      enrichment: { categories: [], tags: [] },
      recorder,
      stopReason: `failed_${stopReason}`,
      error: {
        code: "GENERATION_FAILED",
        message: finalErrorMsg,
        retryable: true,
      },
    }
  }

  // 10. Postprocessing ke Native WordPress Gutenberg Blocks (Global & Tersembunyi dari User)
  const generatedArticle = postprocessArticle({
    rawTitle: rawOutput.title || request.content.title || `Panduan Lengkap ${keyword}`,
    rawExcerpt: rawOutput.excerpt || `Ulasan lengkap mengenai ${keyword}.`,
    rawMarkdown: rawOutput.markdownContent,
  })

  // Gabungkan taksonomi dari hasil pre-resolution, temuan agent, dan request manual
  const finalCategories =
    rawOutput.categoryIds && rawOutput.categoryIds.length > 0
      ? rawOutput.categoryIds
      : preResolved.categoryIds.length > 0
      ? preResolved.categoryIds
      : request.publishing.categoryIds || []

  const finalTags: number[] =
    preResolved.tagIds.length > 0
      ? preResolved.tagIds
      : []

  const enrichment: WpEnrichment = {
    categories: finalCategories,
    tags: finalTags,
    tagNames: preResolved.tagNames,
    author: preResolved.author?.id ?? request.publishing.authorId ?? rawOutput.authorId ?? undefined,
    authorDetail: preResolved.author
      ? { id: preResolved.author.id, name: preResolved.author.name, bio: preResolved.author.bio }
      : undefined,
    featuredMedia: request.publishing.featuredImageId ?? rawOutput.featuredMediaId ?? recorder.featuredMediaId ?? undefined,
    featuredImage: recorder.featuredImage,
    inContentImages: recorder.inContentImages,
  }

  recorder.recordEvent({
    kind: "summary",
    status: "ok",
    durationMs: 1,
    summary: `Artikel sukses dibuat: "${generatedArticle.title}" (${generatedArticle.wordCount} kata, ${stopReason})`,
  })

  return {
    success: true,
    article: generatedArticle,
    sources: Array.from(recorder.sources.values()),
    enrichment,
    recorder,
    stopReason,
  }
}
