import {
  createWordPressPost,
  resolveOrCreateWordPressTags,
  WPCreatePostPayload,
  WPCreatePostResult,
} from "@/lib/wordpress/client"

export interface WordPressPublishParams {
  baseUrl: string
  username: string
  applicationPassword: string
  article: {
    title: string
    contentHtml: string
    excerpt?: string
    slug?: string
  }
  metadata?: {
    status?: "draft" | "publish" | "future"
    categoryIds?: number[]
    tagNames?: string[]
    authorId?: number
  }
}

export interface WordPressPublishResult {
  ok: boolean
  wpPostId?: number
  wpPostUrl?: string
  status?: string
  error?: string
}

/**
 * Universal Tool: WordPress Publisher
 * Memposting artikel naskah Gutenberg Blocks ke WordPress REST API dengan resolusi tag otomatis.
 */
export async function publishPostToWordPress(
  params: WordPressPublishParams
): Promise<WordPressPublishResult> {
  let resolvedTagIds: number[] = []

  // Selesaikan / buat tag jika ada tagNames
  if (params.metadata?.tagNames && params.metadata.tagNames.length > 0) {
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

  const postPayload: WPCreatePostPayload = {
    title: params.article.title,
    content: params.article.contentHtml,
    excerpt: params.article.excerpt,
    status: params.metadata?.status || "draft",
    categories:
      params.metadata?.categoryIds && params.metadata.categoryIds.length > 0
        ? params.metadata.categoryIds
        : undefined,
    tags: resolvedTagIds.length > 0 ? resolvedTagIds : undefined,
  }

  const wpResult: WPCreatePostResult = await createWordPressPost({
    baseUrl: params.baseUrl,
    username: params.username,
    applicationPassword: params.applicationPassword,
    post: postPayload,
  })

  return {
    ok: wpResult.ok,
    wpPostId: wpResult.wpPostId,
    wpPostUrl: wpResult.wpPostUrl,
    status: wpResult.status,
    error: wpResult.error,
  }
}
