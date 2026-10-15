import { uploadMediaToWordPress } from "@/core/shared/tools/upload-media"
import { markdownToGutenberg } from "@/core/shared/formatters/gutenberg"

export interface ProcessMediaParams {
  baseUrl?: string
  username?: string
  applicationPassword?: string
  siteId?: string
  userId?: string
  postId?: string | null
  markdownContent: string
  featuredImageUrl?: string | null
  articleTitle: string
  /** Sinyal pembatalan: bila abort, unggahan yang berjalan dibatalkan dan sisa gambar dilewati. */
  signal?: AbortSignal
  /**
   * Sinyal berhenti lunak: bila abort, gambar berikutnya tidak diunggah, tetapi unggahan yang SEDANG
   * berjalan dibiarkan selesai — POST media yang diputus di tengah bisa sudah tersimpan di WordPress tanpa
   * tercatat di cache `uploaded_media` (media yatim + unggahan ganda oleh percobaan berikutnya).
   */
  haltSignal?: AbortSignal
}

export interface ProcessMediaResult {
  updatedMarkdown: string
  updatedContentHtml: string
  featuredMediaId?: number
  featuredImageUrl?: string | null
  uploadedImagesCount: number
}

/**
 * Pipeline Otomatisasi Media & Gambar WordPress (Post-Processing)
 *
 * Menginspeksi badan artikel Markdown hasil generate AI:
 * 1. Mendeteksi setiap link gambar eksternal (baik foto sampul / featured image maupun gambar inline di naskah).
 * 2. Memeriksa cache deduplikasi database (`uploaded_media`) agar tidak mengunggah ulang gambar yang sama.
 * 3. Mengunduh dan mengunggah gambar tersebut langsung ke WordPress Media Library via REST API (/wp-json/wp/v2/media).
 * 4. Mengganti link eksternal di badan naskah dengan URL resmi WordPress (/wp-content/uploads/...) beserta atribut block Gutenberg {id=...}.
 * 5. Menghasilkan Gutenberg HTML resmi tanpa hotlink eksternal mentah.
 *
 * Kegagalan unggah per gambar (`ToolOutcome` gagal) tidak menggagalkan pipeline: URL eksternal
 * dibiarkan apa adanya dan kegagalannya dicatat ke log server (pesan sudah tersanitasi).
 */
export async function processAndSyncArticleMedia(
  params: ProcessMediaParams
): Promise<ProcessMediaResult> {
  const {
    baseUrl,
    username,
    applicationPassword,
    siteId,
    userId,
    postId,
    markdownContent,
    featuredImageUrl,
    articleTitle,
    signal,
    haltSignal,
  } = params
  const stopped = () => Boolean(signal?.aborted || haltSignal?.aborted)

  let updatedMarkdown = markdownContent || ""
  let resolvedFeaturedMediaId: number | undefined
  let resolvedFeaturedImageUrl: string | null = featuredImageUrl || null
  let uploadedCount = 0

  // Jika kredensial WordPress tidak lengkap, kembalikan format standar tanpa unggah fisik
  if (!baseUrl || !username || !applicationPassword) {
    return {
      updatedMarkdown,
      updatedContentHtml: markdownToGutenberg(updatedMarkdown),
      featuredMediaId: undefined,
      featuredImageUrl: resolvedFeaturedImageUrl,
      uploadedImagesCount: 0,
    }
  }

  let wpHostname = ""
  try {
    wpHostname = new URL(baseUrl).hostname.toLowerCase()
  } catch {}

  // 1. Tangani Featured Image jika ada dan bertipe eksternal
  if (resolvedFeaturedImageUrl && resolvedFeaturedImageUrl.startsWith("http") && !stopped()) {
    const isAlreadyOnWp = wpHostname && resolvedFeaturedImageUrl.toLowerCase().includes(wpHostname)
    if (!isAlreadyOnWp) {
      const uploadRes = await uploadMediaToWordPress({
        baseUrl,
        username,
        applicationPassword,
        siteId,
        userId,
        postId,
        imageUrl: resolvedFeaturedImageUrl,
        altText: articleTitle,
        title: `Gambar Sampul - ${articleTitle}`,
        signal,
      })

      if (uploadRes.ok) {
        resolvedFeaturedMediaId = uploadRes.data.mediaId
        resolvedFeaturedImageUrl = uploadRes.data.sourceUrl
        if (!uploadRes.data.isCached) uploadedCount++
      } else {
        console.warn(`[auto-media-pipeline] Gagal mengunggah Featured Image ke WP [${uploadRes.code}]: ${uploadRes.message}`)
      }
    }
  }

  // 2. Deteksi semua gambar inline Markdown: ![Alt Text](https://...url...)
  const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)(?:\{[^}]*\})?/g
  const matches = Array.from(updatedMarkdown.matchAll(imageRegex))

  // Kumpulkan daftar gambar unik yang belum berada di WordPress
  const urlToUploadMap = new Map<string, { alt: string }>()
  for (const match of matches) {
    const alt = match[1] || articleTitle
    const url = match[2]
    const isAlreadyOnWp = wpHostname && url.toLowerCase().includes(wpHostname)

    if (!isAlreadyOnWp && !urlToUploadMap.has(url)) {
      urlToUploadMap.set(url, { alt })
    }
  }

  // Unggah masing-masing gambar ke WordPress dan ganti URL-nya di naskah
  for (const [externalUrl, { alt }] of urlToUploadMap.entries()) {
    if (stopped()) break

    const uploadRes = await uploadMediaToWordPress({
      baseUrl,
      username,
      applicationPassword,
      siteId,
      userId,
      postId,
      imageUrl: externalUrl,
      altText: alt,
      title: alt,
      signal,
    })

    if (!uploadRes.ok) {
      console.warn(`[auto-media-pipeline] Gagal mengunggah gambar inline [${uploadRes.code}]: ${uploadRes.message}`)
      continue
    }

    // Ganti seluruh kemunculan link eksternal dengan URL WordPress dan penanda id
    const { sourceUrl: cleanWpUrl, mediaId, isCached } = uploadRes.data

    // Regex untuk menggantikan gambar spesifik ini; atribut `{…}` lain (mis. caption) dipertahankan.
    const targetPattern = new RegExp(
      `!\\[([^\\]]*)\\]\\(${escapeRegExp(externalUrl)}\\)(?:\\{([^}]*)\\})?`,
      "g"
    )
    updatedMarkdown = updatedMarkdown.replace(
      targetPattern,
      (_match, alt: string, attributes: string | undefined) => `![${alt}](${cleanWpUrl})${withMediaId(attributes, mediaId)}`
    )
    if (!isCached) uploadedCount++
  }

  // 3. Konversi naskah Markdown yang telah diselaraskan ke Native WordPress Gutenberg Blocks
  const updatedContentHtml = markdownToGutenberg(updatedMarkdown)

  return {
    updatedMarkdown,
    updatedContentHtml,
    featuredMediaId: resolvedFeaturedMediaId,
    featuredImageUrl: resolvedFeaturedImageUrl,
    uploadedImagesCount: uploadedCount,
  }
}

/**
 * Atribut `{…}` gambar dengan `id` media WordPress: `id` lama diganti, atribut lain (mis. `caption="…"`)
 * dipertahankan. Nilai berkutip dilewati agar teks seperti `caption="id=5"` tidak ikut terhapus.
 */
function withMediaId(attributes: string | undefined, mediaId: number): string {
  const kept = (attributes ?? "")
    .replace(/(["'])[^"']*\1|(^|\s)id=[^\s"']*/g, (match, quote: string | undefined, lead: string | undefined) =>
      quote ? match : (lead ?? "")
    )
    .replace(/\s+/g, " ")
    .trim()
  return kept ? `{${kept} id=${mediaId}}` : `{id=${mediaId}}`
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
