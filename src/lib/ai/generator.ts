/**
 * AI Article Generator via Official @openrouter/agent SDK
 * Mengadopsi prinsip ketat dari anti-slop-writing (v3.0):
 * - Nol dash (em dash dan en dash dilarang total).
 * - Tanpa klise AI (era digital, menyoroti, menggarisbawahi, bukan hanya X melainkan Y).
 * - Variasi ritme kalimat (burstiness tinggi, variasi pembuka kalimat).
 * - Bahasa Indonesia alami, luwes, lugas, dan berbobot.
 */

import { OpenRouter } from "@openrouter/agent"

export interface GenerateArticleParams {
  keyword: string
  category?: string
  tags?: string
  customBrief?: string
  model?: string
  apiKey?: string
}

export interface GeneratedArticle {
  title: string
  contentHtml: string
  excerpt: string
  readingTimeMinutes: number
  modelUsed: string
}

export const POPULAR_AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)", provider: "OpenRouter" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)", provider: "Google" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Kualitas Editorial Tertinggi)", provider: "Anthropic" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta" },
]

const ANTI_SLOP_SYSTEM_PROMPT = `Anda adalah penulis dan editor profesional Indonesia yang menulis artikel secara hidup, otentik, dan bersih dari segala pola klise buatan mesin (anti-slop).

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
- HINDARI anak kalimat sambungan di akhir: jangan akhiri kalimat dengan ", yang menunjukkan..." atau ", menggarisbawahi pentingnya...".

3. STRUKTUR & RITME KALIMAT (BURSTINESS):
- Campurkan kalimat pendek tegas (3-7 kata) dengan kalimat yang lebih panjang mengalir (15-25 kata).
- Jangan buat tiga kalimat berturut-turut dengan panjang yang sama persis.
- Variasikan kata pertama tiap kalimat. Jangan terus-terusan mengawali kalimat dengan "Hal ini", "Ini", "Dalam", "Selain itu", atau "Dengan".
- Buat paragraf yang utuh dan mengalir wajar, jangan potong-potong menjadi satu kalimat per baris layaknya spam media sosial.

4. FORMAT KELUARAN (STRICT JSON VALID):
Kembalikan respon HANYA berupa JSON valid tanpa blok pembungkus markdown (\`\`\`json) dengan struktur:
{
  "title": "Judul artikel yang lugas, menarik, dan wajar (tanpa tanda kutip atau embel-embel bombastis)",
  "excerpt": "Ringkasan padat 1-2 kalimat untuk deskripsi artikel (maksimal 160 karakter)",
  "contentHtml": "Isi artikel lengkap dalam format HTML bersih menggunakan tag <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <blockquote>. DILARANG menggunakan tag <h1> atau <html>/<body>. Pastikan tidak ada karakter dash (—/–)."
}
`

/**
 * Normalisasi dan bersihkan API key dari kemungkinan karakter kutip atau whitespace
 */
export function getSanitizedApiKey(customApiKey?: string): string {
  const rawKey = customApiKey || process.env.OPENROUTER_API_KEY || ""
  return rawKey.trim().replace(/^["']|["']$/g, "")
}

/**
 * Generate artikel berkualitas menggunakan @openrouter/agent SDK
 */
export async function generateArticle(params: GenerateArticleParams): Promise<GeneratedArticle> {
  const apiKey = getSanitizedApiKey(params.apiKey)

  if (!apiKey) {
    throw new Error(
      "Kunci API OpenRouter belum dikonfigurasi. Harap masukkan API Key di file .env (OPENROUTER_API_KEY) atau di menu Pengaturan AI."
    )
  }

  const model =
    params.model || process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-oss-120b"

  const userPrompt = `Tolong tulis artikel lengkap dan berbobot (sekitar 700 sampai 1000 kata) tentang topik berikut:
- Topik / Kata Kunci: ${params.keyword}
${params.category ? `- Kategori: ${params.category}` : ""}
${params.tags ? `- Tag: ${params.tags}` : ""}
${params.customBrief ? `- Catatan Khusus dari Pembaca: ${params.customBrief}` : ""}

Tulislah dengan sudut pandang praktisi yang paham lapangan. Beri contoh nyata, tips praktis yang bisa langsung dicoba, dan hindari penjelasan berputar-putar. Ingat: nol em dash (—) dan nol en dash (–).`

  let rawContent = ""

  try {
    const client = new OpenRouter({
      apiKey,
      httpReferer: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      appTitle: process.env.OPENROUTER_APP_NAME || "WP Autopost Dashboard",
    })

    const result = client.callModel({
      model,
      instructions: ANTI_SLOP_SYSTEM_PROMPT,
      input: userPrompt,
    })

    rawContent = await result.getText()
  } catch (err: unknown) {
    const errorStr = String(err)
    if (errorStr.includes("401") || errorStr.toLowerCase().includes("user not found")) {
      throw new Error(
        "Kunci API OpenRouter tidak valid atau ditolak oleh server (Error 401: User not found). Silakan periksa kembali API Key Anda di https://openrouter.ai/keys atau atur di Pengaturan AI."
      )
    }
    if (errorStr.includes("402") || errorStr.toLowerCase().includes("insufficient_quota")) {
      throw new Error(
        "Saldo kredit akun OpenRouter Anda tidak mencukupi untuk memproses permintaan model ini."
      )
    }
    const message = err instanceof Error ? err.message : "Kesalahan koneksi ke OpenRouter"
    throw new Error(`Gagal menghubungi Agent OpenRouter: ${message}`)
  }

  // Bersihkan respon JSON dari kemungkinan pembungkus markdown
  let cleanJson = rawContent.trim()
  if (cleanJson.startsWith("```json")) {
    cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
  } else if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
  }

  try {
    const parsed = JSON.parse(cleanJson)

    // Pembersihan ekstra: pastikan tidak ada em dash atau en dash yang lolos
    const sanitizedTitle = (parsed.title || params.keyword).replace(/[—–]/g, ", ")
    const sanitizedHtml = (parsed.contentHtml || `<p>${params.keyword}</p>`).replace(/[—–]/g, ", ")
    const sanitizedExcerpt = (parsed.excerpt || "").replace(/[—–]/g, ", ")

    const wordCount = sanitizedHtml.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

    return {
      title: sanitizedTitle,
      contentHtml: sanitizedHtml,
      excerpt: sanitizedExcerpt,
      readingTimeMinutes,
      modelUsed: model,
    }
  } catch {
    // Fallback jika parsing JSON gagal
    const fallbackTitle = params.keyword.replace(/[—–]/g, ", ")
    const cleanRaw = rawContent.replace(/[—–]/g, ", ")
    const fallbackHtml = `<h2>${fallbackTitle}</h2><p>${cleanRaw.replace(/\n\n/g, "</p><p>")}</p>`
    return {
      title: fallbackTitle,
      contentHtml: fallbackHtml,
      excerpt: params.keyword,
      readingTimeMinutes: 3,
      modelUsed: model,
    }
  }
}
