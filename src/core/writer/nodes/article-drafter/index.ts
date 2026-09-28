import { z } from "zod";
import { OpenRouterLlmService } from "@/lib/ai/openrouter";
import { WriterState } from "../../types/engine";
import { ResearchData } from "../../types/contracts";

export const DrafterOutputSchema = z.object({
  title: z
    .string()
    .describe(
      "Judul artikel yang lugas, menarik, dan wajar (tanpa tanda kutip atau embel-embel bombastis)",
    ),
  excerpt: z
    .string()
    .describe(
      "Ringkasan padat 1-2 kalimat untuk deskripsi meta artikel (maksimal 160 karakter)",
    ),
  markdownContent: z
    .string()
    .describe(
      "Isi artikel lengkap dalam format Markdown murni (menggunakan heading ##, ###, paragraf biasa, list -, blockquote >). DILARANG menggunakan tag HTML.",
    ),
});

export interface ArticleDrafterInput {
  keyword: string;
  language?: "id" | "en";
  wordCountTarget?: number;
  title?: string;
  brief?: string;
  author?: { name: string; bio?: string };
  customInstructions?: string;
  researchData?: ResearchData;
  model?: string;
  temperature?: number;
  llmService: OpenRouterLlmService;
}

export interface ArticleDrafterResult {
  rawTitle: string;
  rawExcerpt: string;
  rawMarkdown: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

import { loadNodePrompt } from "../../utils/prompt-loader";

export const ANTI_SLOP_SYSTEM_PROMPT =
  loadNodePrompt("article-drafter").systemPrompt;

/**
 * Logika eksekusi pembuatan draf artikel dengan LLM via prompt.md
 */
export async function executeArticleDrafter(
  input: ArticleDrafterInput,
): Promise<ArticleDrafterResult> {
  const targetWordCount = input.wordCountTarget || 800;
  const promptTemplate = loadNodePrompt("article-drafter");

  // Susun System Prompt dari template prompt.md
  const outputFormat = promptTemplate.getSection("OUTPUT_FORMAT");
  const fullSystemPrompt = [
    promptTemplate.renderSystemPrompt(),
    outputFormat ? `\n${outputFormat}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Siapkan variabel untuk User Prompt template
  const titleReference = input.title
    ? `- Referensi Judul yang Diinginkan: ${input.title}`
    : "";
  const briefNote = input.brief ? `- Catatan Khusus: ${input.brief}` : "";
  const authorPersona = input.author
    ? `- Penulis Artikel: ${input.author.name}${input.author.bio ? ` (${input.author.bio})` : ""}`
    : "";
  const customInstructionsNote = input.customInstructions
    ? `- Instruksi Tambahan: ${input.customInstructions}`
    : "";

  let researchNotes = "";
  if (input.researchData) {
    const entitiesStr = input.researchData.keyEntities?.join(", ") || "";
    const questionsStr = (input.researchData.coreQuestions || []).map((q) => `  * ${q}`).join("\n");
    const outlineStr = (input.researchData.outline || [])
      .map((o, idx) => {
        const pts = (o.keyPoints || []).map((p) => `    - ${p}`).join("\n");
        return `  ${idx + 1}. Subbab ## ${o.heading}\n${pts}`;
      })
      .join("\n");

    researchNotes = [
      "- CETAK BIRU & HASIL RISET TOPIK:",
      `  * Maksud Pencarian: ${input.researchData.searchIntent || "Informasional"}`,
      `  * Profil Pembaca: ${input.researchData.targetAudience || "Umum"}`,
      entitiesStr ? `  * Entitas Semantik Wajib Disertakan (LSI): ${entitiesStr}` : "",
      questionsStr ? `  * Pertanyaan Utama Pembaca yang Harus Terjawab:\n${questionsStr}` : "",
      outlineStr ? `  * Struktur Outline Wajib (Ikuti urutan subjudul ## ini):\n${outlineStr}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const userPrompt = promptTemplate.renderUserPrompt({
    keyword: input.keyword,
    languageName:
      input.language === "en" ? "Bahasa Inggris" : "Bahasa Indonesia",
    wordCountTarget: String(targetWordCount),
    titleReference,
    briefNote,
    authorPersona,
    customInstructionsNote,
    researchNotes,
  });

  const response = await input.llmService.generate({
    systemPrompt: fullSystemPrompt,
    userPrompt,
    model: input.model,
    temperature: input.temperature ?? 0.7,
    maxTokens: 4096,
    outputSchema: DrafterOutputSchema,
  });

  let parsedTitle = input.keyword;
  let parsedExcerpt = "";
  let parsedMarkdown = response.content;

  // Parse JSON
  try {
    let cleanJson = response.content.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(cleanJson);
    parsedTitle = parsed.title || parsedTitle;
    parsedExcerpt = parsed.excerpt || "";
    parsedMarkdown = parsed.markdownContent || parsed.content || parsedMarkdown;
  } catch {
    // Fallback jika respons JSON terpotong penutupnya: coba ekstrak markdownContent dengan regex
    const contentMatch = response.content.match(
      /"markdownContent"\s*:\s*"([\s\S]*)/,
    );
    if (contentMatch && contentMatch[1]) {
      try {
        // Coba unescape karakter string JSON
        const rawContentStr = contentMatch[1].replace(/",?\s*\}?\s*$/, "");
        parsedMarkdown = JSON.parse(`"${rawContentStr.replace(/"/g, '\\"')}"`);
      } catch {
        parsedMarkdown = contentMatch[1]
          .replace(/",?\s*\}?\s*$/, "")
          .replace(/\\n/g, "\n");
      }
    }
  }

  return {
    rawTitle: parsedTitle,
    rawExcerpt: parsedExcerpt,
    rawMarkdown: parsedMarkdown,
    tokenUsage: response.tokenUsage,
  };
}

import { defineNode } from "../../utils/node-factory"

/**
 * Node LangGraph resmi untuk Article Drafter
 * Didefinisikan secara deklaratif via defineNode factory.
 */
export const articleDrafterNode = defineNode({
  id: "article_drafter",
  label: "Penulisan Naskah Anti-Slop",
  isAiNode: true,
  extractLogInput: (state) => ({
    keyword: state.context.request.content.keyword,
    model: state.context.request.model || "default",
    language: state.context.request.content.language || "id",
    wordCountTarget: state.context.request.content.wordCountTarget || 800,
    hasResearchBlueprint: Boolean(state.researchData),
    brief: state.context.request.content.brief || null,
    customInstructions: state.context.promptConfig?.customInstructions || null,
  }),
  extractLogOutput: (output) => {
    const wordCount = output.rawMarkdown ? output.rawMarkdown.trim().split(/\s+/).length : 0
    return {
      title: output.rawTitle,
      excerpt: output.rawExcerpt,
      wordCountEstimate: wordCount,
      charactersCount: output.rawMarkdown?.length || 0,
      tokenUsage: output.tokenUsage || null,
    }
  },

  async run(state, { logMessage }) {
    const keyword = state.context.request.content.keyword
    const wordCountTarget = state.context.request.content.wordCountTarget || 800

    const drafterResult = await executeArticleDrafter({
      keyword,
      language: state.context.request.content.language,
      wordCountTarget,
      title: state.context.request.content.title,
      brief: state.context.request.content.brief,
      author: state.authorDetail,
      customInstructions: state.context.promptConfig?.customInstructions,
      researchData: state.researchData,
      model: state.context.request.model,
      temperature: state.context.request.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llmService: state.context.llmService as any,
    })

    const wordCount = drafterResult.rawMarkdown.trim().split(/\s+/).length
    logMessage(`Naskah selesai ditulis (~${wordCount} kata)`)

    return {
      rawTitle: drafterResult.rawTitle,
      rawExcerpt: drafterResult.rawExcerpt,
      rawMarkdown: drafterResult.rawMarkdown,
      tokenUsage: drafterResult.tokenUsage,
    }
  },
})
