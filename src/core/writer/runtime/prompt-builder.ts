import fs from "fs"
import path from "path"
import { getLanguageDisplayName } from "@/lib/constants/languages"

let cachedGuardrail: string | null = null

function loadGuardrailPrompt(): string {
  if (cachedGuardrail) return cachedGuardrail

  try {
    const p = path.join(process.cwd(), "src", "core", "writer", "runtime", "guardrail.md")
    if (fs.existsSync(p)) {
      cachedGuardrail = fs.readFileSync(p, "utf-8")
      return cachedGuardrail
    }
  } catch (err) {
    console.warn("[prompt-builder] Gagal membaca guardrail.md dari disk, menggunakan fallback:", err)
  }

  return "Patuhi integritas teknis WordPress: gunakan H2/H3 (dilarang H1), tanpa sitasi footnote [1] atau bab referensi, dan tanpa byline penulis manual."
}

export function buildSystemPrompt(workflowPrompt: string): string {
  const guardrail = loadGuardrailPrompt()
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
  customInstructions?: string
}

export function buildUserPrompt(vars: UserPromptVariables): string {
  const briefNote = vars.brief ? `- Catatan Khusus dari Pengguna: ${vars.brief}` : ""
  const authorPersona = vars.author
    ? `- Sudut Pandang Penulis (Persona): Tulis naskah dari perspektif ${vars.author.name}${vars.author.bio ? ` (${vars.author.bio})` : ""}. (DILARANG mencantumkan teks byline 'Penulis: ...' ke naskah).`
    : ""
  const customInstructionsNote = vars.customInstructions
    ? `- Instruksi Tambahan: ${vars.customInstructions}`
    : ""

  const targetWords = vars.wordCountTarget && vars.wordCountTarget >= 500 ? vars.wordCountTarget : 800

  return [
    `Tuliskan artikel mendalam, komprehensif, mengalir alami, dan tuntas dengan ketentuan berikut:`,
    `- Topik / Kata Kunci Utama: "${vars.keyword}"`,
    `- Bahasa: ${getLanguageDisplayName(vars.language)}`,
    `- Target Panjang: minimal ${targetWords} kata`,
    `- Struktur Wajib: Rancang minimal 5 subbab (H2/H3) deskriptif dengan pembahasan multi-paragraf yang tuntas. DILARANG membuat naskah pendek atau ringkasan!`,
    briefNote,
    authorPersona,
    customInstructionsNote,
    "",
    "Sajikan naskah lengkap dan seluruh metadata artikel sesuai instruksi alur kerja editorial.",
  ]
    .filter(Boolean)
    .join("\n")
}
