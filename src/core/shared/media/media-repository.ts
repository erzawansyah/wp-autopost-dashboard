import { createAdminClient } from "@/lib/supabase/admin"

export interface UploadedMediaRecord {
  id?: string
  userId?: string
  siteId?: string
  postId?: string | null
  sourceUrl: string
  siteUrl: string
  imageId: number
  metadata?: {
    alt?: string
    caption?: string
    description?: string
    title?: string
    width?: number
    height?: number
    mime?: string
  }
}

/**
 * Mencari apakah gambar dari `sourceUrl` sudah pernah diunggah ke website WordPress ini (`siteId`)
 * oleh pemilik yang sama (`userId`). Service Role → filter pemilik wajib (isolasi tenant).
 */
export async function findExistingUploadedMedia(params: {
  userId: string
  siteId: string
  sourceUrl: string
}): Promise<UploadedMediaRecord | null> {
  const { userId, siteId, sourceUrl } = params
  if (!userId || !siteId || !sourceUrl) return null

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("uploaded_media")
      .select("id, user_id, site_id, post_id, source_url, site_url, image_id, metadata")
      .eq("user_id", userId)
      .eq("site_id", siteId)
      .eq("source_url", sourceUrl)
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    return {
      id: data.id,
      userId: data.user_id,
      siteId: data.site_id,
      postId: data.post_id,
      sourceUrl: data.source_url,
      siteUrl: data.site_url,
      imageId: Number(data.image_id),
      metadata: (data.metadata as UploadedMediaRecord["metadata"]) || {},
    }
  } catch {
    // Graceful fallback jika tabel belum dibuat di Supabase pengguna
    return null
  }
}

/**
 * Menyimpan metadata gambar yang baru saja sukses diunggah ke WordPress ke tabel `uploaded_media`.
 * `userId` wajib: kolom `uploaded_media.user_id` NOT NULL dan menjadi kunci isolasi tenant.
 */
export async function recordUploadedMedia(record: {
  userId: string
  siteId: string
  postId?: string | null
  sourceUrl: string
  siteUrl: string
  imageId: number
  metadata?: Record<string, unknown>
}): Promise<boolean> {
  const { userId, siteId, postId, sourceUrl, siteUrl, imageId, metadata } = record
  if (!userId || !siteId || !sourceUrl || !siteUrl || !imageId) return false

  try {
    const supabase = createAdminClient()
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      site_id: siteId,
      source_url: sourceUrl,
      site_url: siteUrl,
      image_id: imageId,
      metadata: metadata || {},
    }

    if (postId) insertPayload.post_id = postId

    const { error } = await supabase.from("uploaded_media").insert(insertPayload)
    if (error) {
      // Abaikan jika duplikat atau tabel belum ada
      return false
    }

    return true
  } catch {
    return false
  }
}
