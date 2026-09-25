import { z } from "zod"
import { WritingEngine, EngineContext, EngineResult, EngineCapabilities } from "../../types/engine"
import { GeneratedArticle, WriterError } from "../../types/contracts"
import { markdownToGutenberg } from "../../../shared/formatters/gutenberg"
import {
  cleanMarkdown,
  calculateWordCount,
  createSlug,
  extractSubheadings,
  sanitizeDashes,
} from "../../../shared/formatters/markdown-cleaner"

const QuickOutputSchema = z.object({
  title: z
    .string()
    .describe("Judul artikel yang lugas, menarik, dan wajar (tanpa tanda kutip atau embel-embel bombastis)"),
  excerpt: z
    .string()
    .describe("Ringkasan padat 1-2 kalimat untuk deskripsi meta artikel (maksimal 160 karakter)"),
  markdownContent: z
    .string()
    .describe(
      "Isi artikel lengkap dalam format Markdown murni (menggunakan heading ##, ###, paragraf biasa, list -, blockquote >). DILARANG menggunakan tag HTML."
    ),
})

/**
 * Deteksi jika respon LLM merupakan penolakan chatbot / permintaan klarifikasi data
 */
function isChatbotRefusal(text: string): boolean {
  const lower = text.toLowerCase()
  const refusalPhrases = [
    "mohon maaf",
    "maaf, saya tidak",
    "tidak dapat menemukan informasi",
    "apakah anda memiliki",
    "mohon berikan daftarnya",
    "sebagai model ai",
    "data terbatas",
    "informasi spesifik mengenai",
    "saya memerlukan informasi yang lebih rinci",
    "tidak bisa memberikan contoh",
  ]
  return refusalPhrases.some((phrase) => lower.includes(phrase))
}

const BASE_SYSTEM_PROMPT = `Anda adalah penulis dan editor profesional Indonesia yang menulis artikel secara hidup, otentik, dan bersih dari segala pola klise buatan mesin (anti-slop).

PANDUAN GAYA BAHASA (ANTI-SLOP WRITING v3.0):

1. KEBIJAKAN TANDA BACA (NOL DASH):
- DILARANG TOTAL menggunakan em dash (—) maupun en dash (–). Nol dash di seluruh tulisan.
- Ganti dengan tanda titik untuk memecah kalimat, koma jika masih satu alur, atau tanda kurung untuk catatan tambahan.
- Jangan gunakan titik dua berlebihan di setiap paragraf.

2. LARANGAN KATA DAN FRASE KLISE (BANLIST):
- JANGAN gunakan pembuka klise: "Di era digital yang serba cepat ini", "Dalam lanskap modern", "Seiring perkembangan zaman", "Perlu diketahui bahwa", "Tidak dapat dipungkiri".
- JANGAN gunakan penutup klise: "Kesimpulannya", "Sebagai penutup", "Dapat disimpulkan bahwa", "Pada akhirnya", "Satu hal yang pasti".
- JANGAN gunakan kata penggelembung: "sangat krusial", "sangat penting", "sangat signifikan", "fundamental", "luar biasa", "mendalam", "berperan penting".
- JANGAN gunakan kata kerja analitis berlebihan: "menyelami", "menyoroti", "menggarisbawahi", "memfasilitasi", "mengoptimalkan", "mengedepankan", "mewujudkan".
- JANGAN gunakan kalke bahasa asing yang aneh: "lanskap" (figuratif), "permadani" (tapestry), "ekosistem" (figuratif).
- HINDARI kata "merupakan" berulang-ulang. Gunakan kata kerja aktif langsung atau "adalah".
- HINDARI pola kontras palsu: "bukan sekadar X melainkan Y" atau "tidak hanya X tetapi juga Y". Langsung sebutkan apa intinya.

3. STRUKTUR & RITME KALIMAT (BURSTINESS):
- Campurkan kalimat pendek tegas (3-7 kata) dengan kalimat yang lebih panjang mengalir (15-25 kata).
- Jangan buat tiga kalimat berturut-turut dengan panjang yang sama persis.
- Variasikan kata pertama tiap kalimat.

4. ATURAN MUTLAK PERILAKU PENULIS (AUTONOMOUS PUBLISHER):
- ANDA ADALAH MESIN PENERBIT ARTIKEL OTOMATIS SIAP TAYANG, BUKAN CHATBOT PERCAKAPAN.
- DILARANG KERAS berbicara kepada pengguna, meminta maaf, atau membuat alasan teknis.
- Selesaikan artikel secara tuntas dari awal hingga akhir (minimal 700 - 1200 kata).
- KELUARAN WAJIB DALAM FORMAT MARKDOWN MURNI (bukan HTML).`

export class QuickEngine implements WritingEngine {
  readonly id = "quick"
  readonly name = "Tulis Cepat (1-Shot Markdown)"
  readonly description = "Menghasilkan artikel utuh secara cepat dalam 1-shot dengan format Markdown murni yang siap dikonversi ke Gutenberg Blocks."
  readonly version = "1.0.0"

  readonly capabilities: EngineCapabilities = {
    supportsResearch: false,
    supportsInContentImages: false,
    supportsAudit: false,
    estimatedDurationSeconds: 15,
    recommendedModelTier: "fast",
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const warnings: string[] = []
    const nodesExecuted: string[] = ["quick_draft"]

    const targetWordCount = ctx.request.content.wordCountTarget || 800

    // Susun System Prompt
    const fullSystemPrompt = [
      BASE_SYSTEM_PROMPT,
      "\n--- FORMAT KELUARAN (STRICT JSON) ---",
      'Kembalikan respon berupa JSON valid: { "title": "Judul lugas tanpa embel-embel", "excerpt": "Ringkasan 1-2 kalimat (maksimal 160 karakter)", "markdownContent": "Isi artikel lengkap dalam format Markdown murni..." }',
    ].join("\n\n")

    // Susun User Prompt
    const userPromptParts = [
      `Tolong tulis artikel lengkap dan berbobot (sekitar ${targetWordCount} kata) tentang topik berikut:`,
      `- Topik / Kata Kunci: ${ctx.request.content.keyword}`,
      `- Bahasa: ${ctx.request.content.language === "en" ? "Bahasa Inggris" : "Bahasa Indonesia"}`,
    ]

    if (ctx.request.content.title) {
      userPromptParts.push(`- Referensi Judul yang Diinginkan: ${ctx.request.content.title}`)
    }
    if (ctx.request.content.brief) {
      userPromptParts.push(`- Catatan Khusus dari Pembaca: ${ctx.request.content.brief}`)
    }
    if (ctx.promptConfig.customInstructions) {
      userPromptParts.push(`- Instruksi Tambahan: ${ctx.promptConfig.customInstructions}`)
    }

    userPromptParts.push(
      `Tulislah dengan sudut pandang praktisi yang paham lapangan. Beri contoh nyata, tips praktis yang bisa langsung dicoba, dan selesaikan artikel secara tuntas dari awal hingga akhir. Ingat: format Markdown murni, nol em dash (—), dan nol en dash (–).`
    )

    const userPrompt = userPromptParts.join("\n")

    try {
      const response = await ctx.llmService.generate({
        systemPrompt: fullSystemPrompt,
        userPrompt,
        model: ctx.request.model,
        temperature: ctx.request.temperature ?? 0.7,
        outputSchema: QuickOutputSchema,
      })

      let parsedTitle = ""
      let parsedExcerpt = ""
      let parsedMarkdown = ""

      // Parse output
      try {
        let cleanJson = response.content.trim()
        if (cleanJson.startsWith("```json")) {
          cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
        } else if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
        }

        const parsed = JSON.parse(cleanJson)
        parsedTitle = parsed.title || ctx.request.content.keyword
        parsedExcerpt = parsed.excerpt || ""
        parsedMarkdown = parsed.markdownContent || parsed.content || ""
      } catch {
        // Fallback jika respons bukan JSON valid tapi teks Markdown langsung
        parsedTitle = ctx.request.content.keyword
        parsedMarkdown = response.content
        parsedExcerpt = ctx.request.content.keyword
      }

      // Guardrail: Deteksi Penolakan Chatbot / Konten Terlalu Singkat
      if (isChatbotRefusal(parsedMarkdown) || parsedMarkdown.length < 350) {
        warnings.push("Deteksi penolakan chatbot / naskah terlalu singkat. Menjalankan recovery generator...")
        nodesExecuted.push("quick_recovery")

        try {
          const recoveryRes = await ctx.llmService.generate({
            systemPrompt: BASE_SYSTEM_PROMPT,
            userPrompt:
              `Sebagai publisher otonom, tulis naskah artikel blog utuh dan mendalam (minimal 700 - 1000 kata) tentang topik: "${ctx.request.content.keyword}". ` +
              `DILARANG KERAS meminta maaf atau meminta pengguna memberikan data tambahan! Gunakan pemahaman ensiklopedis Anda. ` +
              `Format keluaran WAJIB objek JSON valid: { "title": "...", "excerpt": "...", "markdownContent": "..." }.`,
            model: ctx.request.model,
            temperature: 0.8,
          })

          let recJson = recoveryRes.content.trim()
          if (recJson.startsWith("```json")) {
            recJson = recJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
          } else if (recJson.startsWith("```")) {
            recJson = recJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
          }

          const parsedRec = JSON.parse(recJson)
          if (parsedRec.markdownContent && !isChatbotRefusal(parsedRec.markdownContent)) {
            parsedTitle = parsedRec.title || parsedTitle
            parsedExcerpt = parsedRec.excerpt || parsedExcerpt
            parsedMarkdown = parsedRec.markdownContent
          }
        } catch {
          // Tetap gunakan naskah pertama jika recovery error
        }
      }

      // Bersihkan Markdown (nol-dash, normalisasi spasi)
      const cleanedMarkdown = cleanMarkdown(parsedMarkdown)
      const cleanedTitle = sanitizeDashes(parsedTitle.trim())
      const cleanedExcerpt = sanitizeDashes(parsedExcerpt.trim())

      // Serialisasi Markdown ke WordPress Gutenberg Blocks resmi
      const gutenbergHtml = markdownToGutenberg(cleanedMarkdown)

      const wordCount = calculateWordCount(cleanedMarkdown)
      const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))
      const subheadings = extractSubheadings(cleanedMarkdown)
      const slug = createSlug(cleanedTitle)

      const article: GeneratedArticle = {
        title: cleanedTitle,
        slug,
        markdownContent: cleanedMarkdown,
        contentHtml: gutenbergHtml,
        excerpt: cleanedExcerpt,
        wordCount,
        readingTimeMinutes,
        subheadings,
      }

      return {
        success: true,
        article,
        nodesExecuted,
        tokenUsage: response.tokenUsage,
        warnings,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Kesalahan tidak diketahui pada QuickEngine"
      const writerError: WriterError = {
        code: "GENERATION_ERROR",
        message: errorMsg,
        node: "quick_draft",
        retryable: true,
      }
      return {
        success: false,
        nodesExecuted,
        warnings,
        error: writerError,
      }
    }
  }
}
