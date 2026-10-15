import { getLanguageDisplayName } from "@/lib/constants/languages"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"

const DEFAULT_GUARDRAIL_FALLBACK =
  "Patuhi integritas teknis WordPress: gunakan H2/H3 (dilarang H1), tanpa sitasi footnote [1] atau bab referensi, dan tanpa byline penulis manual."

const DEFAULT_USER_PROMPT_FALLBACK =
  'Tuliskan artikel mendalam, mengalir alami, dan tuntas untuk topik: "{{keyword}}" ({{language}}). Target minimal {{targetWords}} kata dengan 5 subbab deskriptif. {{briefNote}} {{authorPersona}} {{customInstructions}}'

const AUTHOR_PERSONA_FALLBACK = "- Persona penulis: {{authorName}}{{authorBio}}."

/**
 * Baris persona author WordPress (`system-author-persona.md`) untuk prompt agen & finalize call.
 * Tanpa author → string kosong (baris template ikut hilang saat `renderPrompt`).
 */
export function buildAuthorPersonaLine(author?: { name: string; bio?: string }): string {
  if (!author) return ""
  return renderPrompt(loadPrompt("system-author-persona.md", AUTHOR_PERSONA_FALLBACK, "user"), {
    authorName: author.name,
    authorBio: author.bio ? ` (${author.bio})` : "",
  })
}

export interface SystemPromptVariables {
  siteName?: string
  siteUrl?: string
  authorName?: string
  authorBio?: string
  categoryName?: string
  language?: string
}

export function buildSystemPrompt(
  workflowPrompt: string,
  vars?: SystemPromptVariables
): string {
  const guardrail = loadPrompt("system-guardrail.md", DEFAULT_GUARDRAIL_FALLBACK)
  const renderedWorkflow = vars
    ? renderPrompt(workflowPrompt, {
        siteName: vars.siteName || "",
        siteUrl: vars.siteUrl || "",
        authorName: vars.authorName || "",
        authorBio: vars.authorBio || "",
        categoryName: vars.categoryName || "",
        language: vars.language || "",
      })
    : workflowPrompt.trim()

  return [
    guardrail.trim(),
    "---",
    "### ALUR KERJA KHUSUS AGENT (WORKFLOW PROMPT PENGGUNA):",
    renderedWorkflow.trim(),
  ].join("\n\n")
}

export interface UserPromptVariables {
  keyword: string
  title?: string
  language: string
  wordCountTarget: number
  brief?: string
  author?: { name: string; bio?: string }
  categoryName?: string
  tagsList?: string
  customInstructions?: string
  hasTools?: boolean
}

export function buildUserPrompt(vars: UserPromptVariables): string {
  const template = loadPrompt("agent-user-prompt.md", DEFAULT_USER_PROMPT_FALLBACK)

  const titleInstruction = vars.title
    ? `- Judul Artikel Wajib: Gunakan judul ini persis sebagai judul artikel utama: "${vars.title}". Dilarang mengganti atau mengubah substansi judul ini.`
    : ""
  const categoryInfo = vars.categoryName ? `- Target Kategori: ${vars.categoryName}` : ""
  const tagsInfo = vars.tagsList ? `- Tag Terkait: ${vars.tagsList}` : ""
  const briefNote = vars.brief ? `- Catatan Khusus dari Pengguna: ${vars.brief}` : ""
  const authorPersona = buildAuthorPersonaLine(vars.author)
  const customInstructionsNote = vars.customInstructions
    ? `- Instruksi Tambahan: ${vars.customInstructions}`
    : ""

  const researchInstruction = vars.hasTools
    ? `- Langkah Awal Wajib (Riset & Visual): Manfaatkan tools riset yang tersedia (keyword_suggestions, web_search, image_search) terlebih dahulu untuk mengumpulkan fakta konkret, variasi kata kunci LSI, dan aset gambar pendukung sebelum Anda mulai menyusun draf naskah.`
    : ""

  const targetWords = vars.wordCountTarget && vars.wordCountTarget >= 500 ? vars.wordCountTarget : 800

  return renderPrompt(template, {
    keyword: vars.keyword,
    titleInstruction,
    language: getLanguageDisplayName(vars.language),
    targetWords,
    categoryInfo,
    tagsInfo,
    briefNote,
    authorPersona,
    customInstructions: customInstructionsNote,
    researchInstruction,
  })
}
