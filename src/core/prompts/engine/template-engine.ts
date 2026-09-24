import fs from "fs/promises"
import path from "path"
import { PromptVariables, PromptTemplateOptions } from "./types"

/**
 * Render teks template prompt dengan mengganti placeholder ${{key}} menggunakan nilai variabel dinamis.
 * 
 * Fitur:
 * - Mendukung format `${{key}}` dan `${{ key }}` (dengan spasi).
 * - Menangani array (dikonversi menjadi string terpisah koma).
 * - Membersihkan baris yang berisi variabel kosong secara otomatis (opsional via stripEmptyVariables).
 */
export function renderPrompt(
  templateContent: string,
  variables: PromptVariables,
  options: PromptTemplateOptions = {}
): string {
  const { stripEmptyVariables = true, fallbackValue = "" } = options

  let rendered = templateContent

  // 1. Eksekusi pembersihan baris bersyarat jika variabel bernilai kosong
  if (stripEmptyVariables) {
    const lines = rendered.split(/\r?\n/)
    const filteredLines = lines.filter((line) => {
      const match = line.match(/\${{\s*([a-zA-Z0-9_]+)\s*}}/)
      if (match) {
        const key = match[1]
        const val = variables[key]
        const isEmpty =
          val === undefined ||
          val === null ||
          (typeof val === "string" && val.trim() === "") ||
          (Array.isArray(val) && val.length === 0)

        // Jika satu baris hanya berisi label dan variabel yang kosong, buang baris tersebut
        if (isEmpty && line.trim().startsWith("-") || line.trim().startsWith("*")) {
          return false
        }
      }
      return true
    })
    rendered = filteredLines.join("\n")
  }

  // 2. Ganti semua placeholder ${{key}} dengan nilai variabel aktual
  rendered = rendered.replace(/\${{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const val = variables[key]
    if (val === undefined || val === null) {
      return fallbackValue
    }
    if (Array.isArray(val)) {
      return val.map((item) => String(item).trim()).filter(Boolean).join(", ")
    }
    return String(val).trim()
  })

  return rendered.trim()
}

/**
 * Membaca berkas template prompt dari direktori `src/core/prompts/`.
 * @param relativePath path relatif di dalam folder `src/core/prompts/` (contoh: "system/anti-slop-base.md")
 */
export async function loadPromptTemplate(relativePath: string): Promise<string> {
  const basePath = path.resolve(process.cwd(), "src/core/prompts", relativePath)
  try {
    const content = await fs.readFile(basePath, "utf-8")
    return content.trim()
  } catch (err) {
    throw new Error(
      `Gagal memuat template prompt dari jalur: ${basePath}. Pastikan file template tersedia. Error: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}
