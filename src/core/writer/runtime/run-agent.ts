import "server-only";
import { HumanMessage } from "@langchain/core/messages";
import { StructuredTool } from "@langchain/core/tools";
import { MISSING_OPENROUTER_KEY_MESSAGE } from "@/lib/ai/platform-keys";
import { DecryptedUserKeys } from "@/types/settings";
import { classifyLlmError, type LlmErrorKind } from "@/core/shared/llm/errors";
import { createLlmGateway } from "@/core/shared/llm/gateway";
import {
  WriterRequest,
  GeneratedArticle,
  ArticleSource,
  WpEnrichment,
  WriterError,
} from "../types/contracts";
import {
  AgentProfile,
  clampLimits,
  ALL_MANDATORY_TOOL_IDS,
} from "../types/profile";
import { RunRecorder, AgentStepEvent } from "./telemetry";
import { checkToolEligibility } from "../tools/eligibility";
import { ToolRegistry } from "../tools/registry";
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder";
import { buildWriterAgent } from "./build-agent";
import { executeSingleFinalizeCall } from "./finalize";
import { postprocessArticle } from "./postprocess";
import { unescapeLiteralNewlines } from "../../shared/formatters/markdown-cleaner";
import { extractArticleJsonFromText, ArticleOutput } from "./output-schema";
import { preResolveTaxonomyAndAuthor } from "./pre-resolve";
import { getLanguageDisplayName } from "@/lib/constants/languages";
import "../tools"; // Pastikan seluruh tool terdaftar ke registry

export interface RunAgentOptions {
  request: WriterRequest;
  profile: AgentProfile;
  userKeys: DecryptedUserKeys;
  userId?: string;
  onEventListener?: (event: AgentStepEvent) => void;
  abortSignal?: AbortSignal;
}

export interface RunAgentResult {
  success: boolean;
  article?: GeneratedArticle;
  sources: ArticleSource[];
  enrichment: WpEnrichment;
  recorder: RunRecorder;
  stopReason: string;
  /** Model utama hasil resolusi gateway LLM. */
  model: string;
  error?: WriterError;
}

/**
 * Penolakan LLM yang tidak akan pulih dengan mengulang (kunci ditolak / kredit habis):
 * finalize call dilewati dan error ditandai non-retryable agar antrean tidak membuang token.
 */
const NON_RECOVERABLE_LLM_ERRORS: Partial<
  Record<LlmErrorKind, { stopReason: string; code: string; message: string }>
> = {
  auth: {
    stopReason: "llm_auth_failed",
    code: "LLM_AUTH_FAILED",
    message:
      "Kunci API OpenRouter ditolak (HTTP 401/403). Periksa kunci BYOK Anda di menu Pengaturan ➔ Kunci API (/settings/keys).",
  },
  quota: {
    stopReason: "llm_quota_exhausted",
    code: "LLM_QUOTA_EXHAUSTED",
    message: "Kredit atau kuota akun OpenRouter Anda habis. Isi ulang kredit OpenRouter lalu jalankan ulang.",
  },
};

export async function runAgentWriter(
  options: RunAgentOptions,
): Promise<RunAgentResult> {
  const { request, userKeys, onEventListener, abortSignal } = options;
  const profile = {
    ...options.profile,
    limits: clampLimits(options.profile.limits, options.profile.mode),
  };

  const recorder = new RunRecorder(onEventListener);
  const limits = profile.limits;
  const keyword = request.content.keyword;
  const language = request.content.language || "id";
  const targetWordCount =
    request.content.wordCountTarget || limits.minWordCount || 800;

  // Sinyal agent loop (model & tools): batal saat run dibatalkan dari luar ATAU timeout loop
  // tercapai (timer dimulai tepat sebelum loop). Pre-resolve & finalize hanya terikat sinyal luar.
  const loopController = new AbortController();
  const abortLoop = () => loopController.abort(abortSignal?.reason);
  if (abortSignal?.aborted) abortLoop();
  else abortSignal?.addEventListener("abort", abortLoop, { once: true });

  // 1. Kredensial WordPress
  const site = request.site;
  const wpCredentials =
    site?.baseUrl && site?.username && site?.applicationPassword
      ? {
          baseUrl: site.baseUrl,
          username: site.username,
          applicationPassword: site.applicationPassword,
        }
      : undefined;

  // 2. Evaluasi kelayakan tool (Eligibility Guard)
  // Tool WordPress inti selalu built-in aktif secara otomatis pada setiap agent
  const effectiveToolIds = Array.from(
    new Set([...(profile.toolIds || []), ...ALL_MANDATORY_TOOL_IDS]),
  );
  const eligibility = checkToolEligibility(
    effectiveToolIds,
    userKeys,
    wpCredentials,
  );

  // Catat tool yang diblokir sebagai event guard
  for (const blocked of eligibility.blockedTools) {
    recorder.recordEvent({
      kind: "guard",
      tool: blocked.id,
      status: "blocked",
      durationMs: 1,
      summary: `Tool '${blocked.id}' dilewati: ${blocked.reason}`,
    });
  }

  // Bangun instance tool yang memenuhi syarat
  const activeTools = eligibility.eligibleToolIds
    .map((id) => {
      const def = ToolRegistry.get(id);
      if (!def) return null;
      return def.build({
        userKeys,
        wpCredentials,
        language,
        recorder,
        signal: loopController.signal,
      });
    })
    .filter(Boolean) as StructuredTool[];

  // 3. Gateway LLM run: kunci BYOK, pemilihan model, retry/fallback, token & biaya, tracer tenant
  const gateway = createLlmGateway({
    apiKey: request.apiKey || userKeys.openrouterKey,
    modelCandidates: [request.model, userKeys.defaultAiModel, profile.model],
    temperature: profile.temperature,
    reasoningEffort:
      request.reasoningEffort || profile.reasoningEffort || userKeys.reasoningEffort,
    tracing: userKeys,
    usage: recorder.usage,
    signal: abortSignal,
    onModelFallback: ({ from, to, kind, status }) =>
      recorder.recordEvent({
        kind: "guard",
        tool: "model_fallback",
        status: "error",
        durationMs: 1,
        summary: `Model '${from}' gagal (${status ? `HTTP ${status}, ` : ""}${kind}); beralih ke model cadangan '${to}'.`,
        argsPreview: { from, to },
      }),
  });
  const selectedModel = gateway.model;

  const failure = (
    stopReason: string,
    error: WriterError,
  ): RunAgentResult => ({
    success: false,
    sources: Array.from(recorder.sources.values()),
    enrichment: { categories: [], tags: [] },
    recorder,
    stopReason,
    model: selectedModel,
    error,
  });

  try {
    if (!gateway.hasKey) {
      recorder.recordEvent({
        kind: "guard",
        status: "error",
        durationMs: 0,
        summary: MISSING_OPENROUTER_KEY_MESSAGE,
      });
      return failure("missing_api_key", {
        code: "MISSING_API_KEY",
        message: MISSING_OPENROUTER_KEY_MESSAGE,
        node: "llm_initialization",
        retryable: false,
      });
    }

    if (gateway.tracingProject) {
      recorder.recordEvent({
        kind: "guard",
        status: "ok",
        durationMs: 1,
        summary: `LangSmith Tracing aktif (Project: ${gateway.tracingProject})`,
      });
    }

    // 4. Pre-Resolution: Resolusi Taksonomi & Author WordPress di latar belakang via LLM
    const preResolved = await preResolveTaxonomyAndAuthor({
      wpCredentials,
      requestedAuthorId: request.publishing.authorId,
      requestedCategoryIds: request.publishing.categoryIds,
      requestedTagNames: request.publishing.tagNames,
      keyword,
      language,
      brief: request.content.brief,
      gateway,
      signal: abortSignal,
      recorder,
    });

    // 5. Prompting
    const siteUrl = request.site?.baseUrl || "";
    let siteName = request.site?.siteName || "";
    if (!siteName && siteUrl) {
      try {
        const parsed = new URL(siteUrl);
        siteName = parsed.hostname.replace(/^www\./, "");
      } catch {}
    }

    const systemPrompt = buildSystemPrompt(profile.workflowPrompt, {
      siteName,
      siteUrl,
      authorName: preResolved.author?.name,
      authorBio: preResolved.author?.bio,
      categoryName:
        preResolved.categoryNames.length > 0
          ? preResolved.categoryNames.join(", ")
          : undefined,
      language: getLanguageDisplayName(language),
    });
    const userPromptText = buildUserPrompt({
      keyword,
      title: request.content.title,
      language,
      wordCountTarget: targetWordCount,
      brief: request.content.brief,
      author: preResolved.author
        ? { name: preResolved.author.name, bio: preResolved.author.bio }
        : undefined,
      categoryName:
        preResolved.categoryNames.length > 0
          ? preResolved.categoryNames.join(", ")
          : undefined,
      tagsList:
        preResolved.tagNames.length > 0
          ? preResolved.tagNames.join(", ")
          : undefined,
      customInstructions: request.customInstructions,
      hasTools: activeTools.length > 0,
    });

    // 6. Bangun Writer Agent
    let agent: Awaited<ReturnType<typeof buildWriterAgent>>;
    try {
      agent = await buildWriterAgent({
        mode: profile.mode,
        gateway,
        tools: activeTools,
        systemPrompt,
        limits,
        recorder,
        skills: profile.skills,
        userId: options.userId || request.userId,
      });
    } catch (agentBuildErr: unknown) {
      const errText =
        agentBuildErr instanceof Error
          ? agentBuildErr.message
          : String(agentBuildErr);
      recorder.recordEvent({
        kind: "guard",
        status: "error",
        durationMs: 1,
        summary: `Gagal menginisialisasi agent: ${errText}`,
      });
      return failure("agent_build_failed", {
        code: "AGENT_BUILD_FAILED",
        message: `Gagal membangun agent: ${errText}`,
        retryable: false,
      });
    }

    // 7. Timeout agent loop
    const timer = setTimeout(() => {
      loopController.abort();
    }, limits.timeoutSeconds * 1000);

    let rawOutput: Partial<ArticleOutput> | null = null;
    let stopReason = "completed";
    const threadId = `agent-run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // 8. Eksekusi Agent Loop
    try {
      const agentResult = await agent.invoke(
        {
          messages: [new HumanMessage(userPromptText)],
        },
        {
          configurable: { thread_id: threadId },
          recursionLimit:
            profile.mode === "deep"
              ? Math.max(150, Math.min(300, limits.maxModelCalls * 10 + 60))
              : Math.max(80, Math.min(200, limits.maxModelCalls * 10 + 40)),
          signal: loopController.signal,
          runName: `Panitera [${profile.mode === "deep" ? "Deep Agent" : "Standard Agent"}]: ${keyword.slice(0, 45)}`,
          tags: [profile.mode, "panitera", `lang:${language}`, siteName].filter(
            Boolean,
          ),
          metadata: {
            keyword,
            siteUrl,
            siteName,
            model: selectedModel,
            agentProfileRef: profile.ref,
            mode: profile.mode,
            userId: request.userId,
          },
          // Tracer LangSmith tenant khusus run ini (dibuat gateway), tidak pernah lewat process.env.
          callbacks: gateway.callbacks,
        },
      );

      clearTimeout(timer);

      // Ambil pesan terakhir dan ekstrak teks secara bersih (menghindari double JSON stringify)
      const messages = agentResult.messages || [];
      const lastMsg = messages[messages.length - 1];

      const extractRawMessageText = (content: unknown): string => {
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          return content
            .map((part) => {
              if (typeof part === "string") return part;
              if (
                typeof part === "object" &&
                part !== null &&
                "text" in part &&
                typeof (part as { text?: unknown }).text === "string"
              ) {
                return (part as { text: string }).text;
              }
              return "";
            })
            .filter(Boolean)
            .join("\n\n");
        }
        return "";
      };

      const rawText = extractRawMessageText(lastMsg?.content);

      rawOutput = extractArticleJsonFromText(rawText);
      if (!rawOutput?.markdownContent && rawText.length > 200) {
        rawOutput = {
          title: request.content.title || `Panduan Lengkap ${keyword}`,
          excerpt: `Ulasan terpercaya mengenai ${keyword}.`,
          // Pulihkan literal "\n" tanpa menyentuh isi blok kode
          markdownContent: unescapeLiteralNewlines(rawText),
        };
      }
    } catch (invokeErr: unknown) {
      clearTimeout(timer);
      const errText =
        invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
      const llmRejection = NON_RECOVERABLE_LLM_ERRORS[classifyLlmError(invokeErr).kind];
      const isTimeout =
        loopController.signal.aborted ||
        errText.includes("abort") ||
        errText.includes("timeout");
      const isLimit =
        errText.includes("ModelCallLimitMiddlewareError") ||
        errText.includes("ToolCallLimitExceededError") ||
        errText.includes("recursionLimit");

      stopReason = llmRejection
        ? llmRejection.stopReason
        : isTimeout
          ? "timeout_exceeded"
          : isLimit
            ? "limit_reached"
            : "agent_loop_interrupted";

      recorder.recordEvent({
        kind: "guard",
        status: "blocked",
        durationMs: 1,
        summary: `Eksekusi agent terhenti (${stopReason}): ${errText.slice(0, 120)}`,
      });

      // Kunci ditolak / kredit habis: finalize call pasti ditolak juga, jadi langsung gagal permanen.
      if (llmRejection) {
        return failure(`failed_${stopReason}`, {
          code: llmRejection.code,
          message: llmRejection.message,
          node: "agent_loop",
          retryable: false,
        });
      }
    }

    // 9. Evaluasi Kelengkapan Naskah & Trigger Single Finalize Call jika diperlukan
    const rawWords = rawOutput?.markdownContent
      ? rawOutput.markdownContent.split(/\s+/).filter(Boolean).length
      : 0;

    const needsFinalize =
      !rawOutput?.markdownContent ||
      rawWords < Math.max(250, Math.round(limits.minWordCount * 0.6));

    // Run yang dibatalkan dari luar (worker berhenti/lease hilang) tidak lagi memanggil LLM.
    if (needsFinalize && !abortSignal?.aborted) {
      console.log(
        `[runAgentWriter] Naskah belum lengkap (${rawWords} kata, stopReason: ${stopReason}). Menjalankan Single Finalize Call...`,
      );

      const finalizeResult = await executeSingleFinalizeCall({
        gateway,
        systemPrompt,
        keyword,
        language,
        targetWordCount,
        brief: request.content.brief,
        author: preResolved.author
          ? { name: preResolved.author.name, bio: preResolved.author.bio }
          : undefined,
        customInstructions: request.customInstructions,
        recorder,
        reason: stopReason,
        signal: abortSignal,
      });

      if (finalizeResult && finalizeResult.markdownContent) {
        rawOutput = finalizeResult;
        stopReason =
          stopReason === "completed"
            ? "finalized_after_short_draft"
            : `finalized_after_${stopReason}`;
      }
    }

    // 10. Hasil Akhir
    if (!rawOutput?.markdownContent || rawOutput.markdownContent.length < 200) {
      const finalErrorMsg = `Agent gagal menghasilkan naskah artikel yang memenuhi kriteria (${stopReason}).`;
      recorder.recordEvent({
        kind: "summary",
        status: "error",
        durationMs: 1,
        summary: finalErrorMsg,
      });

      return failure(`failed_${stopReason}`, {
        code: "GENERATION_FAILED",
        message: finalErrorMsg,
        retryable: true,
      });
    }

    // 11. Postprocessing ke Native WordPress Gutenberg Blocks (Global & Tersembunyi dari User)
    const generatedArticle = postprocessArticle({
      rawTitle:
        rawOutput.title || request.content.title || `Panduan Lengkap ${keyword}`,
      rawExcerpt: rawOutput.excerpt || `Ulasan lengkap mengenai ${keyword}.`,
      rawMarkdown: rawOutput.markdownContent,
    });

    // Gabungkan taksonomi dari hasil pre-resolution, temuan agent, dan request manual
    const finalCategories =
      rawOutput.categoryIds && rawOutput.categoryIds.length > 0
        ? rawOutput.categoryIds
        : preResolved.categoryIds.length > 0
          ? preResolved.categoryIds
          : request.publishing.categoryIds || [];

    const finalTags: number[] =
      preResolved.tagIds.length > 0 ? preResolved.tagIds : [];

    const enrichment: WpEnrichment = {
      categories: finalCategories,
      categoryNames: preResolved.categoryNames,
      tags: finalTags,
      tagNames: preResolved.tagNames,
      author:
        preResolved.author?.id ??
        request.publishing.authorId ??
        rawOutput.authorId ??
        undefined,
      authorDetail: preResolved.author
        ? {
            id: preResolved.author.id,
            name: preResolved.author.name,
            bio: preResolved.author.bio,
          }
        : undefined,
      featuredMedia:
        request.publishing.featuredImageId ??
        rawOutput.featuredMediaId ??
        recorder.featuredMediaId ??
        undefined,
      featuredImage: recorder.featuredImage,
      inContentImages: recorder.inContentImages,
    };

    recorder.recordEvent({
      kind: "summary",
      status: "ok",
      durationMs: 1,
      summary: `Artikel sukses dibuat: "${generatedArticle.title}" (${generatedArticle.wordCount} kata, ${stopReason})`,
    });

    return {
      success: true,
      article: generatedArticle,
      sources: Array.from(recorder.sources.values()),
      enrichment,
      recorder,
      stopReason,
      model: selectedModel,
    };
  } finally {
    abortSignal?.removeEventListener("abort", abortLoop);
    await gateway.flush();
  }
}
