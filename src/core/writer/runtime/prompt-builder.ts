import { getLanguageDisplayName } from "@/lib/constants/languages"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { ARTICLE_OUTPUT_RULES } from "./article-validation"

const GUARDRAIL_FALLBACK = "Never fabricate facts, never write an H1, footnotes, or a byline, and write in the requested article language."
const STYLE_FALLBACK = "Write naturally, specifically, and without AI clichés."
const LAYOUT_FALLBACK = "{{guardrail}}\n\n{{stylePack}}\n\n{{workflow}}"
const USER_PROMPT_FALLBACK = 'Write a complete article about "{{keyword}}" in {{language}}, at least {{targetWords}} words. {{outputFormat}}'
const ARTICLE_OUTPUT_FALLBACK = "Deliver the article as three fields: title, excerpt, and a pure Markdown body."

/** Batas bawah target kata permintaan; di bawahnya dipakai target bawaan. */
const MIN_TARGET_WORDS = 500
const DEFAULT_TARGET_WORDS = 800

/** Paket gaya per kode bahasa artikel (`system-style-*.md`); bahasa lain memakai paket umum. */
function loadStylePack(language?: string): string {
  switch ((language || "id").toLowerCase()) {
    case "id":
      return loadPrompt("system-style-id.md", STYLE_FALLBACK, "system")
    case "en":
      return loadPrompt("system-style-en.md", STYLE_FALLBACK, "system")
    default:
      return loadPrompt("system-style-general.md", STYLE_FALLBACK, "system")
  }
}

/** Aturan tiga field naskah (`system-article-output.md`) dengan batas dari `settings.json` → `articleOutput`. */
export function articleFieldRules(): string {
  return renderPrompt(loadPrompt("system-article-output.md", ARTICLE_OUTPUT_FALLBACK, "user"), {
    titleMaxChars: ARTICLE_OUTPUT_RULES.titleMaxChars,
    excerptMinChars: ARTICLE_OUTPUT_RULES.excerptMinChars,
    excerptMaxChars: ARTICLE_OUTPUT_RULES.excerptMaxChars,
    minH2Sections: ARTICLE_OUTPUT_RULES.minH2Sections,
  })
}

/** Bio author untuk baris persona: ` (bio)` atau kosong. */
export function formatAuthorBio(bio?: string): string {
  return bio ? ` (${bio})` : ""
}

export interface SystemPromptVariables {
  /** Kode bahasa artikel (mis. `id`, `en`) untuk memilih paket gaya. */
  languageCode?: string
  siteName?: string
  siteUrl?: string
  authorName?: string
  authorBio?: string
  categoryName?: string
}

/**
 * System prompt agen: guardrail → paket gaya bahasa artikel → workflow Agent Profile (`system-writer-layout.md`).
 * Workflow kustom pengguna boleh memakai `{{siteName}}`, `{{siteUrl}}`, `{{authorName}}`, `{{authorBio}}`,
 * `{{categoryName}}`, dan `{{language}}`.
 */
export function buildSystemPrompt(workflowPrompt: string, vars: SystemPromptVariables = {}): string {
  const renderedWorkflow = renderPrompt(workflowPrompt, {
    siteName: vars.siteName || "",
    siteUrl: vars.siteUrl || "",
    authorName: vars.authorName || "",
    authorBio: vars.authorBio || "",
    categoryName: vars.categoryName || "",
    language: getLanguageDisplayName(vars.languageCode),
  })

  return renderPrompt(loadPrompt("system-writer-layout.md", LAYOUT_FALLBACK, "system"), {
    guardrail: loadPrompt("system-guardrail.md", GUARDRAIL_FALLBACK, "system").trim(),
    stylePack: loadStylePack(vars.languageCode).trim(),
    workflow: renderedWorkflow,
  })
}

export interface UserPromptVariables {
  keyword: string
  title?: string
  /** Kode bahasa artikel. */
  language: string
  wordCountTarget: number
  siteName?: string
  siteUrl?: string
  brief?: string
  author?: { name: string; bio?: string }
  categoryName?: string
  tagsList?: string
  customInstructions?: string
  /** Nama tool riset/visual yang aktif di run ini. */
  toolNames?: string[]
}

/** Brief permintaan penulisan (`agent-user-prompt.md`) + aturan tiga field naskah. */
export function buildUserPrompt(vars: UserPromptVariables): string {
  const targetWords =
    vars.wordCountTarget && vars.wordCountTarget >= MIN_TARGET_WORDS ? vars.wordCountTarget : DEFAULT_TARGET_WORDS

  return renderPrompt(loadPrompt("agent-user-prompt.md", USER_PROMPT_FALLBACK, "user"), {
    keyword: vars.keyword,
    language: getLanguageDisplayName(vars.language),
    targetWords,
    siteName: vars.siteName || "",
    siteUrl: vars.siteUrl || "",
    title: vars.title || "",
    categoryName: vars.categoryName || "",
    tagsList: vars.tagsList || "",
    authorName: vars.author?.name || "",
    authorBio: formatAuthorBio(vars.author?.bio),
    availableTools: (vars.toolNames ?? []).join(", "),
    brief: vars.brief || "",
    customInstructions: vars.customInstructions || "",
    outputFormat: articleFieldRules(),
  })
}
