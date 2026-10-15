import {
  describeWpNetworkError,
  makeAuthHeader,
  normalizeAndValidateWpUrl,
  wpFetch,
} from "@/lib/wordpress/client"
import { ResponseTooLargeError, safeFetch } from "@/lib/net/safe-fetch"
import { findExistingUploadedMedia, recordUploadedMedia } from "@/core/shared/media/media-repository"

export interface UploadMediaParams {
  imageUrl: string
  filename?: string
  altText?: string
  caption?: string
  title?: string
  baseUrl?: string
  username?: string
  applicationPassword?: string
  siteId?: string
  userId?: string
  postId?: string | null
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
  isCached?: boolean
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

/** Batas ukuran gambar sumber yang boleh diunduh lalu diunggah ke Media Library. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

/**
 * Deteksi format gambar dari magic bytes (bukan dari header/URL yang bisa dipalsukan).
 * Hanya format raster yang didukung WordPress Media Library; SVG/HTML/dokumen ditolak.
 */
export function detectImageType(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" }
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" }
  if (asciiAt(bytes, 0, 6) === "GIF87a" || asciiAt(bytes, 0, 6) === "GIF89a") return { mime: "image/gif", ext: "gif" }
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") return { mime: "image/webp", ext: "webp" }
  if (asciiAt(bytes, 4, 4) === "ftyp" && ["avif", "avis"].includes(asciiAt(bytes, 8, 4))) {
    return { mime: "image/avif", ext: "avif" }
  }
  return null
}

/** Content-Type sumber yang masih mungkin berisi gambar (sebagian CDN/S3 memakai octet-stream). */
function isImageLikeContentType(contentType: string): boolean {
  const value = contentType.toLowerCase()
  return !value || value.startsWith("image/") || value.includes("octet-stream")
}

/**
 * Universal Tool: uploadMediaToWordPress (upload_media)
 * Mengunduh gambar dari URL dan mengunggahnya ke WordPress Media Library via REST API standar (/wp-json/wp/v2/media).
 * Dilengkapi dengan Cache Deduplikasi (tabel `uploaded_media`) agar tidak mengunggah ulang gambar yang sama.
 */
export async function uploadMediaToWordPress(
  params: UploadMediaParams
): Promise<UploadMediaResult> {
  const imageUrl = params.imageUrl?.trim()
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return {
      ok: false,
      mediaId: 0,
      sourceUrl: "",
      error: "URL gambar tidak valid atau kosong.",
    }
  }

  // 0. Cek Cache Deduplikasi Media di Database Supabase (per pemilik + situs; tanpa keduanya cache dilewati)
  if (params.userId && params.siteId) {
    const cached = await findExistingUploadedMedia({
      userId: params.userId,
      siteId: params.siteId,
      sourceUrl: imageUrl,
    })
    if (cached) {
      return {
        ok: true,
        mediaId: cached.imageId,
        sourceUrl: cached.siteUrl,
        title: cached.metadata?.title || params.title || "Foto Terupload",
        altText: cached.metadata?.alt || params.altText,
        caption: cached.metadata?.caption || params.caption,
        isCached: true,
      }
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
    // 1. Unduh buffer gambar dari URL asal (URL pilihan LLM → wajib Anti-SSRF + batas ukuran)
    const imageRes = await safeFetch(
      imageUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          Accept: "image/*,*/*",
        },
      },
      { timeoutMs, maxBytes: MAX_IMAGE_BYTES }
    )

    if (!imageRes.ok) {
      await imageRes.body?.cancel()
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: `Gagal mengunduh gambar asal dari URL (Status HTTP: ${imageRes.status})`,
      }
    }

    const contentType = imageRes.headers.get("content-type") || ""
    if (!isImageLikeContentType(contentType)) {
      await imageRes.body?.cancel()
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: `URL tidak mengarah ke berkas gambar (Content-Type: ${contentType.split(";")[0]}).`,
      }
    }

    const imageBytes = new Uint8Array(await imageRes.arrayBuffer())

    if (imageBytes.byteLength === 0) {
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: "Buffer gambar kosong (0 byte).",
      }
    }

    const imageType = detectImageType(imageBytes)
    if (!imageType) {
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: "Berkas dari URL bukan gambar yang didukung (JPEG, PNG, GIF, WebP, AVIF).",
      }
    }
    const { mime, ext } = imageType

    const rawFilename = params.filename || params.altText || params.title || "foto-artikel"
    const safeBaseName = sanitizeFilename(rawFilename)
    const finalFilename = `${safeBaseName}-${Date.now().toString().slice(-4)}.${ext}`

    // 2. Upload biner gambar ke endpoint WordPress REST API /wp-json/wp/v2/media
    let uploadRes: Response
    try {
      uploadRes = await wpFetch(
        `${normalizedUrl}/wp-json/wp/v2/media`,
        {
          method: "POST",
          headers: {
            Authorization: makeAuthHeader(params.username, params.applicationPassword),
            "Content-Disposition": `attachment; filename="${finalFilename}"`,
            "Content-Type": mime,
            "User-Agent": "WP-Autopost-Dashboard/1.0",
            Accept: "application/json",
          },
          body: imageBytes,
        },
        { timeoutMs }
      )
    } catch (uploadErr: unknown) {
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: describeWpNetworkError(uploadErr, "Gagal menghubungi WordPress saat mengunggah media."),
      }
    }

    if (!uploadRes.ok) {
      const errBody = await uploadRes.json().catch(() => null)
      const errDetail = errBody?.message || `Status HTTP ${uploadRes.status}`
      return {
        ok: false,
        mediaId: 0,
        sourceUrl: imageUrl,
        error: `WordPress menolak upload media: ${errDetail}`,
      }
    }

    const mediaData = await uploadRes.json()
    const mediaId = Number(mediaData.id)
    const wpSourceUrl = mediaData.source_url || imageUrl

    // 3. Update metadata alt_text, caption, dan title jika ada
    if (params.altText || params.caption || params.title) {
      try {
        const metaRes = await wpFetch(`${normalizedUrl}/wp-json/wp/v2/media/${mediaId}`, {
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
        await metaRes.body?.cancel()
      } catch {
        // Abaikan kegagalan update metadata sekunder jika file utama sudah terunggah
      }
    }

    // 4. Rekam ke Cache Deduplikasi Media di Database Supabase
    if (params.userId && params.siteId && wpSourceUrl && mediaId) {
      void recordUploadedMedia({
        userId: params.userId,
        siteId: params.siteId,
        postId: params.postId,
        sourceUrl: imageUrl,
        siteUrl: wpSourceUrl,
        imageId: mediaId,
        metadata: {
          alt: params.altText,
          caption: params.caption,
          title: params.title,
          mime,
        },
      })
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
    const msg =
      err instanceof ResponseTooLargeError
        ? `Ukuran gambar melebihi batas ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`
        : err instanceof Error
          ? err.message
          : "Kesalahan tidak terduga saat mengunggah media"
    return {
      ok: false,
      mediaId: 0,
      sourceUrl: imageUrl,
      error: msg,
    }
  }
}
