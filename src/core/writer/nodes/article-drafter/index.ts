import { z } from "zod"
import { OpenRouterLlmService } from "@/lib/ai/openrouter"
import { WriterState } from "../../types/engine"

export const DrafterOutputSchema = z.object({
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

export interface ArticleDrafterInput {
  keyword: string
  language?: "id" | "en"
  wordCountTarget?: number
  title?: string
  brief?: string
  customInstructions?: string
  model?: string
  temperature?: number
  llmService: OpenRouterLlmService
}

export interface ArticleDrafterResult {
  rawTitle: string
  rawExcerpt: string
  rawMarkdown: string
  tokenUsage?: {
    prompt: number
    completion: number
    total: number
  }
}

export const ANTI_SLOP_SYSTEM_PROMPT = `Anda adalah penulis dan editor profesional Indonesia yang menulis artikel secara hidup, otentik, dan bersih dari segala pola klise buatan mesin (anti-slop).

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

/**
 * Logika eksekusi pembuatan draf artikel dengan LLM
 */
export async function executeArticleDrafter(input: ArticleDrafterInput): Promise<ArticleDrafterResult> {
  const targetWordCount = input.wordCountTarget || 800

  // Susun System Prompt
  const fullSystemPrompt = [
    ANTI_SLOP_SYSTEM_PROMPT,
    "\n--- FORMAT KELUARAN (STRICT JSON) ---",
    'Kembalikan respon berupa JSON valid: { "title": "Judul lugas tanpa embel-embel", "excerpt": "Ringkasan 1-2 kalimat (maksimal 160 karakter)", "markdownContent": "Isi artikel lengkap dalam format Markdown murni..." }',
  ].join("\n\n")

  // Susun User Prompt
  const userPromptParts = [
    `Tolong tulis artikel lengkap dan berbobot (sekitar ${targetWordCount} kata) tentang topik berikut:`,
    `- Topik / Kata Kunci: ${input.keyword}`,
    `- Bahasa: ${input.language === "en" ? "Bahasa Inggris" : "Bahasa Indonesia"}`,
  ]

  if (input.title) {
    userPromptParts.push(`- Referensi Judul yang Diinginkan: ${input.title}`)
  }
  if (input.brief) {
    userPromptParts.push(`- Catatan Khusus: ${input.brief}`)
  }
  if (input.customInstructions) {
    userPromptParts.push(`- Instruksi Tambahan: ${input.customInstructions}`)
  }

  userPromptParts.push(
    `Tulislah dengan sudut pandang praktisi yang paham lapangan. Beri contoh nyata, tips praktis yang bisa langsung dicoba, dan selesaikan artikel secara tuntas dari awal hingga akhir. Ingat: format Markdown murni, nol em dash (—), dan nol en dash (–).`
  )

  const userPrompt = userPromptParts.join("\n")

  const response = await input.llmService.generate({
    systemPrompt: fullSystemPrompt,
    userPrompt,
    model: input.model,
    temperature: input.temperature ?? 0.7,
    outputSchema: DrafterOutputSchema,
  })

  let parsedTitle = input.keyword
  let parsedExcerpt = ""
  let parsedMarkdown = response.content

  // Parse JSON
  try {
    let cleanJson = response.content.trim()
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
    }

    const parsed = JSON.parse(cleanJson)
    parsedTitle = parsed.title || parsedTitle
    parsedExcerpt = parsed.excerpt || ""
    parsedMarkdown = parsed.markdownContent || parsed.content || parsedMarkdown
  } catch {
    // Fallback jika respons teks langsung
  }

  return {
    rawTitle: parsedTitle,
    rawExcerpt: parsedExcerpt,
    rawMarkdown: parsedMarkdown,
    tokenUsage: response.tokenUsage,
  }
}

/**
 * Node LangGraph resmi untuk Article Drafter
 * Langsung menerima dan memperbarui WriterState.
 */
export async function articleDrafterNode(state: WriterState): Promise<Partial<WriterState>> {
  if (state.error) {
    return {}
  }

  try {
    const drafterResult = await executeArticleDrafter({
      keyword: state.context.request.content.keyword,
      language: state.context.request.content.language,
      wordCountTarget: state.context.request.content.wordCountTarget || 800,
      title: state.context.request.content.title,
      brief: state.context.request.content.brief,
      customInstructions: state.context.promptConfig.customInstructions,
      model: state.context.request.model,
      temperature: state.context.request.temperature,
      llmService: state.context.llmService as any,
    })

    return {
      rawTitle: drafterResult.rawTitle,
      rawExcerpt: drafterResult.rawExcerpt,
      rawMarkdown: drafterResult.rawMarkdown,
      tokenUsage: drafterResult.tokenUsage,
      nodesExecuted: ["article_drafter"],
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Kesalahan eksekusi drafter LLM"
    return {
      error: {
        code: "GENERATION_ERROR",
        message: errorMsg,
        node: "article_drafter",
        retryable: true,
      },
    }
  }
}
