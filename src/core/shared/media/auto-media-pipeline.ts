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
  } = params

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
  if (resolvedFeaturedImageUrl && resolvedFeaturedImageUrl.startsWith("http")) {
    const isAlreadyOnWp = wpHostname && resolvedFeaturedImageUrl.toLowerCase().includes(wpHostname)
    if (!isAlreadyOnWp) {
      try {
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
        })

        if (uploadRes.ok && uploadRes.mediaId && uploadRes.sourceUrl) {
          resolvedFeaturedMediaId = uploadRes.mediaId
          resolvedFeaturedImageUrl = uploadRes.sourceUrl
          if (!uploadRes.isCached) uploadedCount++
        }
      } catch (featErr) {
        console.warn("[auto-media-pipeline] Gagal mengunggah Featured Image ke WP:", featErr)
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
    try {
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
      })

      if (uploadRes.ok && uploadRes.mediaId && uploadRes.sourceUrl) {
        // Ganti seluruh kemunculan link eksternal dengan URL WordPress dan penanda id
        const cleanWpUrl = uploadRes.sourceUrl
        const mediaId = uploadRes.mediaId

        // Regex untuk menggantikan gambar spesifik ini
        const targetPattern = new RegExp(
          `!\\[([^\\]]*)\\]\\(${escapeRegExp(externalUrl)}\\)(?:\\{[^}]*\\})?`,
          "g"
        )
        updatedMarkdown = updatedMarkdown.replace(
          targetPattern,
          `![$1](${cleanWpUrl}){id=${mediaId}}`
        )
        if (!uploadRes.isCached) uploadedCount++
      }
    } catch (inlineErr) {
      console.warn(`[auto-media-pipeline] Gagal mengunggah gambar inline "${externalUrl}":`, inlineErr)
    }
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

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
