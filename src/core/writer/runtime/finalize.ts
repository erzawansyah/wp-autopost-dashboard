import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { getLanguageDisplayName } from "@/lib/constants/languages"
import { ArticleOutput, ArticleOutputSchema, extractArticleJsonFromText } from "./output-schema"
import { RunRecorder } from "./telemetry"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"

export interface FinalizeCallParams {
  llm: BaseChatModel
  systemPrompt: string
  keyword: string
  language: string
  targetWordCount: number
  brief?: string
  author?: { name: string; bio?: string }
  customInstructions?: string
  recorder: RunRecorder
  reason: string
}

/**
 * Finalize Call Tunggal (Single-Shot Emergency Synthesis):
 * Dieksekusi tepat 1x TANPA tools jika agent terhenti oleh batas kuota / timeout
 * atau naskah dari agent belum memenuhi target minimal kata.
 * Menggunakan seluruh data riset & media yang berhasil dikumpulkan oleh recorder.
 */
export async function executeSingleFinalizeCall(
  params: FinalizeCallParams
): Promise<ArticleOutput | null> {
  const start = Date.now()
  const { llm, systemPrompt, keyword, language, targetWordCount, recorder } = params

  // Siapkan digest ringkas dari data yang sudah dikumpulkan oleh agent (hemat token)
  const factsList = Array.from(recorder.sources.values())
    .slice(0, 6)
    .map((s, idx) => `[Fakta ${idx + 1}] Sumber: ${s.title || s.url}\nRingkasan: ${s.snippet || "-"}`)
    .join("\n\n")

  const mediaEmbeds = recorder.inContentImages
    .map((img) => `![${img.altText || img.subheading}](${img.imageUrl} "${img.caption || ""}")`)
    .join("\n\n")

  const briefText = params.brief ? `- Catatan Khusus Pengguna: ${params.brief}` : ""
  const authorText = params.author
    ? `- Sudut Pandang Penulis (Persona): Tulis naskah dari sudut pandang ${params.author.name}${params.author.bio ? ` (${params.author.bio})` : ""}. (DILARANG menulis byline teks 'Penulis: ...' ke naskah).`
    : ""
  const instructionsText = params.customInstructions
    ? `- Instruksi Tambahan: ${params.customInstructions}`
    : ""

  const finalizeTemplate = loadPrompt(
    "system-finalize.md",
    `SINTESIS FINAL NASKAH ARTIKEL:
Proses pengumpulan data dan media telah selesai ({{reason}}). Sekarang susun artikel lengkap, mendalam, dan berkualitas editorial tinggi dalam naskah utuh.

=== DATA RISET AKTUAL DARI TOOLS ===
{{factsList}}

=== GAMBAR YANG TELAH DIUNGGAH KE WORDPRESS ===
{{mediaEmbeds}}

=== KETENTUAN PENULISAN ===
- Topik: "{{keyword}}"
- Bahasa: {{language}}
- Target Panjang: minimal {{targetWordCount}} kata
- Struktur: Wajib minimal 5 subbab (H2/H3) deskriptif dengan ulasan mendalam per subbab. DILARANG membuat naskah pendek atau ringkasan!
{{briefText}}
{{authorText}}
{{instructionsText}}

ATURAN STRICT:
1. DILARANG ada angka sitasi akademis seperti [1], [2], [^1]. Integrasikan fakta langsung secara mengalir.
2. DILARANG membuat section "Referensi" atau "Daftar Pustaka" di akhir naskah.
3. DILARANG penomoran subbab (seperti "## 1. ...") dan DILARANG ada judul "Kesimpulan".
4. Sajikan naskah lengkap dari pembuka hingga solusi praktis.`
  )

  const finalizeUserPrompt = renderPrompt(finalizeTemplate, {
    reason: params.reason,
    factsList: factsList || `Topik: "${keyword}"`,
    mediaEmbeds: mediaEmbeds || "Tidak ada gambar subbab tambahan.",
    keyword,
    language: getLanguageDisplayName(language),
    targetWordCount: Math.max(600, targetWordCount),
    briefText,
    authorText,
    instructionsText,
  })

  try {
    let structuredResult: ArticleOutput | null = null

    // Format Markdown-First Universal: Aman untuk semua model AI (termasuk model thinking/reasoning tanpa risiko error tool_choice)
    const directPrompt = `${finalizeUserPrompt}\n\nFORMAT OUTPUT:\nTITLE: [Judul artikel maksimal 60 karakter]\nEXCERPT: [Ringkasan meta deskripsi 130-160 karakter]\n---\n[Naskah artikel lengkap dalam format Markdown murni]`

    const directRes = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: directPrompt },
    ])

    const contentStr = typeof directRes.content === "string" ? directRes.content : JSON.stringify(directRes.content)
    const parsed = extractArticleJsonFromText(contentStr)

    if (parsed?.markdownContent && parsed.markdownContent.length > 150) {
      structuredResult = {
        title: parsed.title || `Panduan Lengkap ${keyword}`,
        excerpt: parsed.excerpt || `Ulasan lengkap dan terpercaya mengenai ${keyword}.`,
        markdownContent: parsed.markdownContent,
        categoryIds: parsed.categoryIds,
        tagNames: parsed.tagNames,
        authorId: parsed.authorId,
        featuredMediaId: parsed.featuredMediaId,
      }
    } else if (contentStr && contentStr.trim().length > 150) {
      // Jaring pengaman darurat jika model tidak mematuhi header TITLE/EXCERPT
      const cleanFallback = contentStr.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
      structuredResult = {
        title: `Panduan Lengkap ${keyword}`,
        excerpt: `Ulasan terpercaya mengenai ${keyword}.`,
        markdownContent: cleanFallback,
      }
    }

    const durationMs = Date.now() - start

    if (structuredResult && structuredResult.markdownContent) {
      const words = structuredResult.markdownContent.split(/\s+/).filter(Boolean).length
      recorder.recordEvent({
        kind: "finalize",
        status: "ok",
        durationMs,
        summary: `Finalize call sukses menghasilkan naskah (${words} kata, ${durationMs}ms)`,
      })
      return structuredResult
    }

    recorder.recordEvent({
      kind: "finalize",
      status: "error",
      durationMs,
      summary: `Finalize call gagal menghasilkan naskah yang valid (${durationMs}ms)`,
    })
    return null
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    recorder.recordEvent({
      kind: "finalize",
      status: "error",
      durationMs,
      summary: `Finalize call exception: ${msg.slice(0, 100)}`,
    })
    return null
  }
}
