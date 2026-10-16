import {
  createWordPressPost,
  resolveOrCreateWordPressTags,
  WPCreatePostPayload,
  WPCreatePostResult,
} from "@/lib/wordpress/client"
import type { SiteStatus } from "@/types/site"
import { processAndSyncArticleMedia } from "@/core/shared/media/auto-media-pipeline"

export interface WordPressPublishParams {
  baseUrl: string
  username: string
  applicationPassword: string
  article: {
    title: string
    contentHtml: string
    markdownContent?: string
    featuredImageUrl?: string | null
    excerpt?: string
    slug?: string
  }
  metadata?: {
    status?: "draft" | "publish" | "future"
    categoryIds?: number[]
    tagNames?: string[]
    tagIds?: number[]
    authorId?: number
    featuredMediaId?: number
    date?: string
  }
}

export interface WordPressPublishResult {
  ok: boolean
  wpPostId?: number
  wpPostUrl?: string
  status?: string
  error?: string
  updatedContentHtml?: string
  featuredMediaId?: number
  /** Kesehatan situs dari request pembuatan post terakhir (`site-health.ts`); `null` = status situs tidak diubah. */
  siteHealth: SiteStatus | null
}

/**
 * Universal Tool: WordPress Publisher
 * Memposting artikel naskah Gutenberg Blocks ke WordPress REST API dengan:
 * 1. Otomasi upload gambar inline & featured image ke Media Library (dan replace URL ke badan teks).
 * 2. Tags handler: verifikasi dan pembuatan tag otomatis jika belum ada di WordPress.
 * 3. Author fallback resilience: kirim ulang aman jika author ID bermasalah.
 */
export async function publishPostToWordPress(
  params: WordPressPublishParams
): Promise<WordPressPublishResult> {
  // 1. Tags Handler: Selesaikan / buat tag jika ada tagNames dan belum ada tagIds
  let resolvedTagIds: number[] =
    params.metadata?.tagIds && params.metadata.tagIds.length > 0
      ? [...params.metadata.tagIds]
      : []

  if (
    resolvedTagIds.length === 0 &&
    params.metadata?.tagNames &&
    params.metadata.tagNames.length > 0
  ) {
    try {
      resolvedTagIds = await resolveOrCreateWordPressTags({
        baseUrl: params.baseUrl,
        username: params.username,
        applicationPassword: params.applicationPassword,
        tagNames: params.metadata.tagNames,
      })
    } catch (tagErr) {
      console.warn("[wordpress-publisher] Gagal menyelesaikan tag WordPress:", tagErr)
    }
  }

  // 2. Media Handler: Auto-upload gambar inline & featured image jika ada markdownContent
  let contentHtml = params.article.contentHtml
  let featuredMediaId = params.metadata?.featuredMediaId

  if (params.article.markdownContent) {
    try {
      const mediaResult = await processAndSyncArticleMedia({
        baseUrl: params.baseUrl,
        username: params.username,
        applicationPassword: params.applicationPassword,
        markdownContent: params.article.markdownContent,
        featuredImageUrl: params.article.featuredImageUrl,
        articleTitle: params.article.title,
      })

      contentHtml = mediaResult.updatedContentHtml
      if (mediaResult.featuredMediaId) {
        featuredMediaId = mediaResult.featuredMediaId
      }
    } catch (mediaErr) {
      console.warn("[wordpress-publisher] Gagal auto-sync media artikel:", mediaErr)
    }
  }

  // 3. Susun Payload Akhir untuk WordPress REST API
  const postPayload: WPCreatePostPayload = {
    title: params.article.title,
    content: contentHtml,
    excerpt: params.article.excerpt,
    status: params.metadata?.status || "draft",
    categories:
      params.metadata?.categoryIds && params.metadata.categoryIds.length > 0
        ? params.metadata.categoryIds
        : undefined,
    tags: resolvedTagIds.length > 0 ? resolvedTagIds : undefined,
    author: params.metadata?.authorId,
    featured_media: featuredMediaId,
    date: params.metadata?.date,
  }

  let wpResult: WPCreatePostResult = await createWordPressPost({
    baseUrl: params.baseUrl,
    username: params.username,
    applicationPassword: params.applicationPassword,
    post: postPayload,
  })

  // Fallback resilience: jika WordPress menolak karena author ID tidak valid atau hak akses kurang,
  // coba kirim ulang secara otomatis tanpa field author agar artikel tetap sukses terbit
  if (!wpResult.ok && wpResult.error && wpResult.error.toLowerCase().includes("author")) {
    console.warn(`[wordpress-publisher] Gagal author: ${wpResult.error}. Mengirim ulang tanpa author ID...`)
    wpResult = await createWordPressPost({
      baseUrl: params.baseUrl,
      username: params.username,
      applicationPassword: params.applicationPassword,
      post: { ...postPayload, author: undefined },
    })
  }

  return {
    ok: wpResult.ok,
    wpPostId: wpResult.wpPostId,
    wpPostUrl: wpResult.wpPostUrl,
    status: wpResult.status,
    error: wpResult.error,
    updatedContentHtml: contentHtml,
    featuredMediaId,
    siteHealth: wpResult.siteHealth,
  }
}
