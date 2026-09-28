import { normalizeAndValidateWpUrl, makeAuthHeader } from "@/lib/wordpress/client"

export interface UploadMediaParams {
  imageUrl: string
  filename?: string
  altText?: string
  caption?: string
  title?: string
  baseUrl?: string
  username?: string
  applicationPassword?: string
  timeoutMs?: number
}

export interface UploadMediaResult {
  ok: boolean
  mediaId: number
  sourceUrl: string
  title?: string
  altText?: string
  caption?: string
  isSimulated?: boolean
  error?: string
}

function sanitizeFilename(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return clean || "artikel-media"
}

function getMimeAndExt(contentType: string | null, url: string): { mime: string; ext: string } {
  if (contentType?.includes("png") || url.endsWith(".png")) {
    return { mime: "image/png", ext: "png" }
  }
  if (contentType?.includes("webp") || url.endsWith(".webp")) {
    return { mime: "image/webp", ext: "webp" }
  }
  if (contentType?.includes("gif") || url.endsWith(".gif")) {
    return { mime: "image/gif", ext: "gif" }
  }
  return { mime: "image/jpeg", ext: "jpg" }
}

/**
 * Universal Tool: uploadMediaToWordPress (upload_media)
 * Mengunduh gambar dari URL dan mengunggahnya ke WordPress Media Library via REST API standar (/wp-json/wp/v2/media).
 */
export async function uploadMediaToWordPress(
  params: UploadMediaParams
): Promise<UploadMediaResult> {
  const imageUrl = params.imageUrl?.trim()
  if (!imageUrl || !imageUrl.startsWith("http")) {
    return {
      ok: false,
      mediaId: 0,
      sourceUrl: "",
      error: "URL gambar tidak valid atau kosong.",
    }
  }

  // Jika kredensial WordPress tidak tersedia (misal diuji di Lab Standalone), berikan respons fallback/simulasi
  if (!params.baseUrl || !params.username || !params.applicationPassword) {
    const mockId = Math.floor(1000 + Math.random() * 9000)
    return {
      ok: true,
      mediaId: mockId,
      sourceUrl: imageUrl,
      title: params.title || "Foto Ilustrasi",
      altText: params.altText,
      caption: params.caption,
      isSimulated: true,
    }
  }

  const { valid, normalizedUrl, error: urlError } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return {
      ok: false,
      mediaId: 0,
      sourceUrl: "",
      error: urlError || "URL WordPress tidak valid.",
    }
  }

  const timeoutMs = params.timeoutMs ?? 25000

  try {
    // 1. Unduh buffer gambar dari URL asal
    const downloadController = new AbortController()
    const downloadTimer = setTimeout(() => downloadController.abort(), timeoutMs)

    const imageRes = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        Accept: "image/*,*/*",
      },
      signal: downloadController.signal,
    })

    clearTimeout(downloadTimer)

    if (!imageRes.ok) {
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: `Gagal mengunduh gambar dari sumber asal (HTTP ${imageRes.status}).`,
      }
    }

    const imageBuffer = await imageRes.arrayBuffer()
    const { mime, ext } = getMimeAndExt(imageRes.headers.get("content-type"), imageUrl)
    const baseName = sanitizeFilename(params.filename || params.title || "foto-artikel")
    const uploadFilename = `${baseName}-${Date.now().toString().slice(-4)}.${ext}`

    // 2. Unggah ke WordPress REST API /wp-json/wp/v2/media
    const uploadController = new AbortController()
    const uploadTimer = setTimeout(() => uploadController.abort(), timeoutMs)

    const uploadEndpoint = `${normalizedUrl}/wp-json/wp/v2/media`
    const uploadRes = await fetch(uploadEndpoint, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Disposition": `attachment; filename="${uploadFilename}"`,
        "Content-Type": mime,
        "User-Agent": "WP-Autopost-Dashboard/1.0",
      },
      body: Buffer.from(imageBuffer),
      signal: uploadController.signal,
    })

    clearTimeout(uploadTimer)

    if (!uploadRes.ok) {
      const errBody = await uploadRes.json().catch(() => ({}))
      const msg = errBody?.message || `Gagal mengunggah media ke WordPress (HTTP ${uploadRes.status}).`
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: msg,
      }
    }

    const mediaData = await uploadRes.json()
    const mediaId = Number(mediaData.id)
    const wpSourceUrl = mediaData.source_url || imageUrl

    // 3. Update metadata alt_text, caption, dan title jika ada
    if (params.altText || params.caption || params.title) {
      try {
        await fetch(`${normalizedUrl}/wp-json/wp/v2/media/${mediaId}`, {
          method: "POST",
          headers: {
            Authorization: makeAuthHeader(params.username, params.applicationPassword),
            "Content-Type": "application/json",
            "User-Agent": "WP-Autopost-Dashboard/1.0",
          },
          body: JSON.stringify({
            alt_text: params.altText || undefined,
            caption: params.caption || undefined,
            title: params.title || undefined,
          }),
        })
      } catch {
        // Abaikan kegagalan update metadata sekunder jika file utama sudah terunggah
      }
    }

    return {
      ok: true,
      mediaId,
      sourceUrl: wpSourceUrl,
      title: params.title || mediaData.title?.rendered,
      altText: params.altText,
      caption: params.caption,
      isSimulated: false,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Kesalahan tidak terduga saat mengunggah media"
    return {
      ok: false,
      mediaId: 0,
      sourceUrl: imageUrl,
      error: msg,
    }
  }
}
