import { getLanguageDisplayName } from "@/lib/constants/languages"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"

const DEFAULT_GUARDRAIL_FALLBACK =
  "Patuhi integritas teknis WordPress: gunakan H2/H3 (dilarang H1), tanpa sitasi footnote [1] atau bab referensi, dan tanpa byline penulis manual."

const DEFAULT_USER_PROMPT_FALLBACK = `Tuliskan artikel mendalam, komprehensif, mengalir alami, dan tuntas dengan ketentuan berikut:
- Topik / Kata Kunci Utama: "{{keyword}}"
- Bahasa: {{language}}
- Target Panjang: minimal {{targetWords}} kata
- Struktur Wajib: Rancang minimal 5 subbab (H2/H3) deskriptif dengan pembahasan multi-paragraf yang tuntas. DILARANG membuat naskah pendek atau ringkasan!
{{briefNote}}
{{authorPersona}}
{{customInstructions}}

Sajikan naskah lengkap dan seluruh metadata artikel sesuai instruksi alur kerja editorial.`

export function buildSystemPrompt(workflowPrompt: string): string {
  const guardrail = loadPrompt("system-guardrail.md", DEFAULT_GUARDRAIL_FALLBACK)
  return [
    guardrail.trim(),
    "---",
    "### ALUR KERJA KHUSUS AGENT (WORKFLOW PROMPT PENGGUNA):",
    workflowPrompt.trim(),
  ].join("\n\n")
}

export interface UserPromptVariables {
  keyword: string
  language: string
  wordCountTarget: number
  brief?: string
  author?: { name: string; bio?: string }
  categoryName?: string
  tagsList?: string
  customInstructions?: string
}

export function buildUserPrompt(vars: UserPromptVariables): string {
  const template = loadPrompt("user-prompt.md", DEFAULT_USER_PROMPT_FALLBACK)

  const categoryInfo = vars.categoryName ? `- Target Kategori: ${vars.categoryName}` : ""
  const tagsInfo = vars.tagsList ? `- Tag Terkait: ${vars.tagsList}` : ""
  const briefNote = vars.brief ? `- Catatan Khusus dari Pengguna: ${vars.brief}` : ""
  const authorPersona = vars.author
    ? `- Sudut Pandang Penulis (Persona): Tulis naskah dari perspektif ${vars.author.name}${vars.author.bio ? ` (${vars.author.bio})` : ""}. (DILARANG mencantumkan teks byline 'Penulis: ...' ke naskah).`
    : ""
  const customInstructionsNote = vars.customInstructions
    ? `- Instruksi Tambahan: ${vars.customInstructions}`
    : ""

  const targetWords = vars.wordCountTarget && vars.wordCountTarget >= 500 ? vars.wordCountTarget : 800

  return renderPrompt(template, {
    keyword: vars.keyword,
    language: getLanguageDisplayName(vars.language),
    targetWords,
    categoryInfo,
    tagsInfo,
    briefNote,
    authorPersona,
    customInstructions: customInstructionsNote,
  })
}
