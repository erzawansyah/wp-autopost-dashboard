/**
 * Contoh kalimat instruksi untuk tool & skill yang aktif di editor Agent Profile (bantuan menulis
 * workflow prompt milik pengguna — bukan prompt sistem). Murni agar dapat diuji.
 */

export interface PromptGuidanceItem {
  id: string
  type: "tool" | "skill"
  role: string
  example: string
}

const TOOL_GUIDANCE: ReadonlyArray<Omit<PromptGuidanceItem, "type">> = [
  {
    id: "keyword_suggestions",
    role: "Saran LSI & ide subbab",
    example:
      "Gunakan `keyword_suggestions` di awal perencanaan untuk mencari variasi kata kunci LSI dan topik penelusuran sebagai inspirasi subbab (H2/H3).",
  },
  {
    id: "web_search",
    role: "Riset fakta & data web",
    example: "Gunakan `web_search` untuk mencari data statistik terkini, studi kasus, atau kutipan pakar terkait topik.",
  },
  {
    id: "image_search",
    role: "Pencarian gambar estetik",
    example:
      "Cari foto yang relevan dengan topik menggunakan `image_search` (gunakan kata kunci visual bahasa Inggris agar hasil foto estetik).",
  },
  {
    id: "web_reader",
    role: "Membaca isi URL rujukan",
    example:
      "Baca sumber terbaik dari hasil pencarian dengan `web_reader`: cek bagian awal atau outline-nya, lalu panggil lagi untuk bagian yang memuat data (offset, `unit: \"lines\"`, atau `from: \"end\"`).",
  },
]

const ANTI_AI_EDITOR = "anti-ai-editor"

/** Panduan untuk tool terpilih + (mode deep) skill terpilih, urut sesuai katalog. */
export function buildPromptGuidance(toolIds: readonly string[], mode: string, skills: readonly string[]): PromptGuidanceItem[] {
  const selectedTools = new Set(toolIds)
  const items: PromptGuidanceItem[] = TOOL_GUIDANCE.filter((item) => selectedTools.has(item.id)).map((item) => ({
    ...item,
    type: "tool",
  }))
  if (mode !== "deep") return items

  if (skills.includes(ANTI_AI_EDITOR)) {
    items.push({
      id: ANTI_AI_EDITOR,
      type: "skill",
      role: "Humanisasi naskah (anti-AI slop)",
      example:
        "Terapkan standar penulisan humanis anti-ai-editor: variasikan panjang kalimat dan hindari kata klise chatbot.",
    })
  }
  for (const slug of skills) {
    if (slug === ANTI_AI_EDITOR) continue
    items.push({
      id: slug,
      type: "skill",
      role: `Panduan keahlian ${slug}`,
      example: `Terapkan pedoman keahlian dari skill ${slug} selama proses riset dan penulisan naskah.`,
    })
  }
  return items
}
