import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { getCategories } from "@/core/shared/tools/get-categories"
import { getTags } from "@/core/shared/tools/get-tags"
import { createTags } from "@/core/shared/tools/create-tags"
import { getAuthor } from "@/core/shared/tools/get-author"
import { publishPostToWordPress } from "@/core/shared/tools/wordpress-publisher"
import { webSearch } from "@/core/shared/tools/web-search"
import { readWebContent } from "@/core/shared/tools/web-reader"
import { searchRoyaltyFreeImages } from "@/core/shared/tools/image-search"
import { embedImagesInMarkdown } from "@/core/shared/tools/image-embedder"
import { uploadMediaToWordPress } from "@/core/shared/tools/upload-media"

import { executeInputValidator } from "@/core/writer/nodes/input-validator"
import { taxonomyResolverNode } from "@/core/writer/nodes/taxonomy-resolver"
import { topicResearcherNode } from "@/core/writer/nodes/topic-researcher"
import { articleDrafterNode } from "@/core/writer/nodes/article-drafter"
import { imageCuratorNode } from "@/core/writer/nodes/image-curator"
import { qualityCheckerNode } from "@/core/writer/nodes/quality-checker"
import { gutenbergFormatterNode } from "@/core/writer/nodes/gutenberg-formatter"
import { agenticWriterNode } from "@/core/writer/nodes/agentic-writer"
import { deepAgentWriterNode } from "@/core/writer/nodes/deepagent-writer"
import { run } from "@/core/writer"
import { OpenRouterLlmService } from "@/lib/ai/openrouter"
import { WriterState } from "@/core/writer/types/engine"
import { WriterRequest } from "@/core/writer/types/contracts"

function createMockWriterRequest(overrides?: Partial<WriterRequest>): WriterRequest {
  return {
    engine: "quick",
    content: {
      keyword: "panduan seo wordpress",
      language: "id",
      style: "default",
      wordCountTarget: 800,
      ...overrides?.content,
    },
    site: {
      siteId: "00000000-0000-0000-0000-000000000000",
      wpSiteId: "00000000-0000-0000-0000-000000000000",
      ...overrides?.site,
    },
    publishing: {
      mode: "draft",
      categoryIds: [],
      tagNames: [],
      ...overrides?.publishing,
    },
    ...overrides,
  }
}

function createMockWriterState(overrides?: Partial<WriterState>): WriterState {
  return {
    context: {
      request: createMockWriterRequest(),
      llmService: new OpenRouterLlmService(),
      promptConfig: {
        systemPrompt: "",
        userPromptTemplate: "",
        variables: {},
      },
    },
    categoryIds: [],
    tagNames: [],
    tagIds: [],
    authorId: undefined,
    authorDetail: undefined,
    researchData: undefined,
    sources: [],
    rawTitle: "",
    rawExcerpt: "",
    rawMarkdown: "",
    featuredMediaId: undefined,
    featuredImage: undefined,
    inContentImages: [],
    curatedImagesText: "",
    curatedImages: [],
    curationSummary: "",
    tokenUsage: undefined,
    article: undefined,
    nodesExecuted: [],
    nodeLogs: [],
    warnings: [],
    error: undefined,
    ...overrides,
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { type, targetId, siteId, params = {}, apiKey, model } = body

    if (!type || !targetId) {
      return NextResponse.json(
        { ok: false, error: "Parameter 'type' dan 'targetId' wajib diisi." },
        { status: 400 }
      )
    }

    // Resolusi kredensial WordPress jika siteId diberikan
    let wpCredentials: {
      siteId: string
      wpSiteId: string
      baseUrl: string
      username: string
      applicationPassword: string
    } | null = null

    if (siteId) {
      const { data: site, error: siteErr } = await supabase
        .from("wp_sites")
        .select("id, site_name, base_url, wp_username, encrypted_app_password")
        .eq("id", siteId)
        .eq("user_id", user.id)
        .single()

      if (siteErr || !site) {
        return NextResponse.json(
          { ok: false, error: "Situs WordPress yang dipilih tidak ditemukan." },
          { status: 404 }
        )
      }

      try {
        const plainPassword = decryptCredential(site.encrypted_app_password)
        wpCredentials = {
          siteId: site.id,
          wpSiteId: site.id,
          baseUrl: site.base_url,
          username: site.wp_username,
          applicationPassword: plainPassword,
        }
      } catch {
        return NextResponse.json(
          { ok: false, error: "Gagal mendekripsi kata sandi aplikasi situs WordPress." },
          { status: 500 }
        )
      }
    }

    // ==========================================
    // 1. PENGUJIAN TIPE: TOOL
    // ==========================================
    if (type === "tool") {
      const activeCredentials = wpCredentials || (params.baseUrl && params.username && params.applicationPassword
        ? {
            siteId: "00000000-0000-0000-0000-000000000000",
            wpSiteId: "00000000-0000-0000-0000-000000000000",
            baseUrl: params.baseUrl,
            username: params.username,
            applicationPassword: params.applicationPassword,
          }
        : null)

      const wpTools = ["get_categories", "get_tags", "create_tags", "get_author", "wordpress_publisher"]
      if (wpTools.includes(targetId) && !activeCredentials) {
        return NextResponse.json(
          {
            ok: false,
            error: "Tool ini memerlukan situs WordPress yang terhubung atau kredensial manual (baseUrl, username, applicationPassword).",
          },
          { status: 400 }
        )
      }

      let toolOutput: unknown = null

      switch (targetId) {
        case "get_categories": {
          if (!activeCredentials) break
          const res = await getCategories(activeCredentials)
          if (!res.ok) {
            return NextResponse.json(
              { ok: false, error: res.error || "Gagal memuat kategori dari WordPress.", durationMs: Date.now() - startTime },
              { status: 400 }
            )
          }
          toolOutput = {
            total: res.categories.length,
            categories: res.categories,
            formattedSummary: res.categories_string,
          }
          break
        }
        case "get_tags": {
          if (!activeCredentials) break
          const res = await getTags(activeCredentials)
          if (!res.ok) {
            return NextResponse.json(
              { ok: false, error: res.error || "Gagal memuat tag dari WordPress.", durationMs: Date.now() - startTime },
              { status: 400 }
            )
          }
          toolOutput = {
            total: res.tags.length,
            tags: res.tags,
            formattedSummary: res.tags_string,
          }
          break
        }
        case "create_tags": {
          if (!activeCredentials) break
          const tagNames = Array.isArray(params.tags)
            ? params.tags
            : typeof params.tags === "string"
            ? params.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
            : ["Panduan AI", "Tips WordPress"]
          const res = await createTags({ ...activeCredentials, tagNames })
          if (!res.ok) {
            return NextResponse.json(
              { ok: false, error: res.error || "Gagal membuat tag di WordPress.", durationMs: Date.now() - startTime },
              { status: 400 }
            )
          }
          const createdString = `Hasil Pembuatan Tag WordPress:\n` +
            res.tags.map((t, idx) => `${idx + 1}. ${t.name} [ID: ${t.id}] ${t.isNew ? "(Tag Baru Dibuat)" : "(Tag Sudah Ada Sebelumnya)"}`).join("\n") +
            `\n\nTotal tag diproses: ${res.tags.length} (${res.createdCount} tag baru).`
          toolOutput = {
            createdCount: res.createdCount,
            totalProcessed: res.tags.length,
            tags: res.tags,
            summary: createdString,
          }
          break
        }
        case "get_author": {
          if (!activeCredentials) break
          const res = await getAuthor(activeCredentials)
          if (!res.ok) {
            return NextResponse.json(
              { ok: false, error: res.error || "Gagal memuat daftar author dari WordPress.", durationMs: Date.now() - startTime },
              { status: 400 }
            )
          }
          toolOutput = {
            total: res.authors.length,
            authors: res.authors,
            formattedSummary: res.authors_string,
          }
          break
        }
        case "wordpress_publisher": {
          if (!activeCredentials) break
          const article = {
            title: params.title || "Artikel Pengujian Lab Antigravity",
            contentHtml: params.contentHtml || "<p>Paragraf pengujian dari Developer Test Bench.</p>",
            excerpt: params.excerpt,
            slug: params.slug,
          }
          const res = await publishPostToWordPress({
            ...activeCredentials,
            article,
            metadata: {
              status: params.status || "draft",
              categoryIds: params.categoryIds,
              tagNames: params.tagNames,
              featuredMediaId: params.featuredMediaId ? Number(params.featuredMediaId) : undefined,
            },
          })
          if (!res.ok) {
            return NextResponse.json(
              { ok: false, error: res.error || "Gagal memposting ke WordPress.", durationMs: Date.now() - startTime },
              { status: 400 }
            )
          }
          toolOutput = {
            status: res.status,
            wpPostId: res.wpPostId,
            wpPostUrl: res.wpPostUrl,
            article: {
              title: article.title,
              slug: article.slug,
            },
            metadata: {
              status: params.status || "draft",
              categoryIds: params.categoryIds,
              tagNames: params.tagNames,
            },
          }
          break
        }
        case "web_search": {
          const query = params.query || "teknik menyeduh kopi v60"
          const limit = params.limit ? Number(params.limit) : 3
          const language = params.language || "id"
          const provider = params.provider || "auto"
          const results = await webSearch({ query, limit, language, provider, apiKey: params.apiKey || apiKey })
          toolOutput = {
            query,
            limit,
            language,
            provider,
            totalResults: results.length,
            results,
          }
          break
        }
        case "web_reader": {
          const res = await readWebContent({
            url: params.url || "https://id.wikipedia.org/wiki/Kopi",
            maxLength: params.maxLength ? Number(params.maxLength) : 1500,
          })
          if (!res.ok) {
            return NextResponse.json(
              { ok: false, error: res.error || "Gagal membaca URL.", durationMs: Date.now() - startTime },
              { status: 400 }
            )
          }
          toolOutput = {
            url: res.url,
            title: res.title,
            wordCount: res.wordCount,
            content: res.content,
          }
          break
        }
        case "image_search": {
          const query = params.query || "pour over coffee barista"
          const count = params.count ? Number(params.count) : 2
          const provider = params.provider || "auto"
          const minWidth = params.minWidth ? Number(params.minWidth) : 1280
          const photos = await searchRoyaltyFreeImages({ query, count, provider, minWidth })
          toolOutput = {
            query,
            provider,
            minWidth,
            totalPhotos: photos.length,
            photos,
          }
          break
        }
        case "image_embedder": {
          let embedImages = params.images
          if (typeof embedImages === "string") {
            try {
              embedImages = JSON.parse(embedImages)
            } catch {
              embedImages = []
            }
          }
          if (!Array.isArray(embedImages) || embedImages.length === 0) {
            embedImages = [
              {
                subheading: "Alat Manual Brew",
                imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd",
                altText: "Dripper V60",
                caption: "Ilustrasi dripper V60",
              },
            ]
          }
          const embedRes = embedImagesInMarkdown({
            markdown: params.markdown || "## Alat Manual Brew\n\nDripper V60 merupakan alat yang populer.\n",
            images: embedImages,
          })
          toolOutput = {
            insertedCount: embedRes.insertedCount,
            unmatchedHeadings: embedRes.unmatchedHeadings,
            updatedMarkdown: embedRes.updatedMarkdown,
          }
          break
        }
        case "upload_media": {
          const imageUrl = params.imageUrl || "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd"
          const title = params.title || "Foto Ilustrasi WordPress"
          const altText = params.altText || "Foto ilustrasi naskah"
          const caption = params.caption || "Ilustrasi pendukung konten"
          const filename = params.filename
          const uploadRes = await uploadMediaToWordPress({
            imageUrl,
            title,
            altText,
            caption,
            filename,
            baseUrl: activeCredentials?.baseUrl,
            username: activeCredentials?.username,
            applicationPassword: activeCredentials?.applicationPassword,
          })
          if (!uploadRes.ok) {
            return NextResponse.json(
              { ok: false, error: uploadRes.error || "Gagal mengunggah media ke WordPress.", durationMs: Date.now() - startTime },
              { status: 400 }
            )
          }
          toolOutput = {
            mediaId: uploadRes.mediaId,
            sourceUrl: uploadRes.sourceUrl,
            title: uploadRes.title,
            altText: uploadRes.altText,
            caption: uploadRes.caption,
            isSimulated: uploadRes.isSimulated || false,
          }
          break
        }
        default:
          return NextResponse.json(
            { ok: false, error: `Tool target '${targetId}' tidak dikenal.` },
            { status: 400 }
          )
      }

      return NextResponse.json({
        ok: true,
        type: "tool",
        targetId,
        durationMs: Date.now() - startTime,
        result: toolOutput,
      })
    }

    // ==========================================
    // 2. PENGUJIAN TIPE: NODE
    // ==========================================
    if (type === "node") {
      let nodeOutput: unknown = null
      let nodeLogs: unknown[] = []

      // Inisialisasi LLM service jika node membutuhkan AI
      const llmService = new OpenRouterLlmService(
        apiKey || process.env.OPENROUTER_API_KEY,
        model || "openai/gpt-oss-120b"
      )

      switch (targetId) {
        case "input_validator": {
          const validationResult = executeInputValidator(
            createMockWriterRequest({
              content: {
                keyword: params.keyword || "panduan seo wordpress",
                brief: params.brief,
                language: params.targetLanguage || "id",
                style: params.style || "default",
                wordCountTarget: params.wordCountTarget || 800,
              },
              publishing: {
                mode: params.mode || "draft",
                categoryIds: [],
                tagNames: [],
              },
              customInstructions: params.customInstructions,
            })
          )
          nodeOutput = validationResult
          break
        }

        case "taxonomy_resolver": {
          const mockState = createMockWriterState({
            context: {
              request: createMockWriterRequest({
                content: {
                  keyword: params.keyword || "panduan wordpress",
                  brief: params.brief,
                  language: "id",
                  style: "default",
                },
                publishing: {
                  mode: "draft",
                  categoryIds: params.userCategoryIds || [],
                  tagNames: params.userTagNames || [],
                },
                site: wpCredentials || undefined,
              }),
              llmService,
              promptConfig: {
                systemPrompt: "",
                userPromptTemplate: "",
                variables: {},
              },
            },
            categoryIds: params.userCategoryIds || [],
            tagNames: params.userTagNames || [],
          })

          const resolved = await taxonomyResolverNode(mockState)
          nodeOutput = resolved
          nodeLogs = mockState.nodeLogs || []
          break
        }

        case "topic_researcher": {
          const mockState = createMockWriterState({
            context: {
              request: createMockWriterRequest({
                content: {
                  keyword: params.keyword || "panduan menyeduh kopi manual brew",
                  brief: params.brief || "Fokus pada metode V60 dan French Press.",
                  language: params.language || "id",
                  style: params.style || "default",
                },
                model: model || params.model,
                temperature: params.temperature !== undefined ? Number(params.temperature) : 0.3,
                apiKey: apiKey || params.apiKey,
              } as any),
              llmService,
              promptConfig: {
                systemPrompt: "",
                userPromptTemplate: "",
                variables: {},
              },
            },
          })

          const researched = await topicResearcherNode(mockState)
          nodeOutput = researched
          nodeLogs = mockState.nodeLogs || []
          break
        }

        case "article_drafter": {
          const mockState = createMockWriterState({
            context: {
              request: createMockWriterRequest({
                content: {
                  keyword: params.keyword || "tips optimasi website wordpress",
                  title: params.title || undefined,
                  brief: params.brief || "Tuliskan tips praktis dan ringkas.",
                  language: params.language || "id",
                  style: params.style || "default",
                  wordCountTarget: params.wordCountTarget ? Number(params.wordCountTarget) : 800,
                },
                customInstructions: params.customInstructions,
                model: model || params.model,
                temperature: params.temperature !== undefined ? Number(params.temperature) : 0.7,
              }),
              llmService,
              promptConfig: {
                systemPrompt: "",
                userPromptTemplate: "",
                variables: {
                  authorName: params.authorName || "Redaksi Editorial",
                  authorBio: params.authorBio || "",
                },
              },
            },
          })

          const drafted = await articleDrafterNode(mockState)
          nodeOutput = drafted
          nodeLogs = mockState.nodeLogs || []
          break
        }

        case "image_curator": {
          const mockState = createMockWriterState({
            context: {
              request: createMockWriterRequest({
                content: {
                  keyword: params.keyword || "kopi manual brew",
                  brief: params.brief || params.promptContent || undefined,
                  language: "id",
                  style: "default",
                },
                site: wpCredentials || undefined,
                model: model || params.model,
                temperature: params.temperature !== undefined ? Number(params.temperature) : 0.2,
                apiKey: apiKey || params.apiKey,
              } as any),
              llmService,
              promptConfig: {
                systemPrompt: "",
                userPromptTemplate: "",
                variables: {},
              },
            },
            rawMarkdown: params.rawMarkdown || params.promptContent || "Brief Konten: Panduan menyeduh kopi manual brew untuk pemula. Membahas alat seduh V60, french press, dan rasio air kopi.",
          })

          const curated = await imageCuratorNode(mockState)
          nodeOutput = curated
          nodeLogs = mockState.nodeLogs || []
          break
        }

        case "quality_checker": {
          const mockState = createMockWriterState({
            context: {
              request: createMockWriterRequest({
                content: {
                  keyword: params.keyword || "panduan ai",
                  language: "id",
                  style: "default",
                },
                model: model || params.model,
              }),
              llmService,
              promptConfig: {
                systemPrompt: "",
                userPromptTemplate: "",
                variables: {},
              },
            },
            rawTitle: params.title || "Panduan Lengkap Pemanfaatan AI Modern",
            rawMarkdown: params.rawMarkdown || params.contentText || "",
          })

          const checked = await qualityCheckerNode(mockState)
          nodeOutput = checked
          nodeLogs = mockState.nodeLogs || []
          break
        }

        case "gutenberg_formatter": {
          const mockState = createMockWriterState({
            rawTitle: params.title || "Judul Pengujian Formatter",
            rawExcerpt: params.excerpt || "",
            rawMarkdown: params.rawMarkdown || params.markdownContent || "# Judul Artikel\n\nParagraf teks utama.\n\n- Poin pertama\n- Poin kedua\n",
          })

          const formatted = await gutenbergFormatterNode(mockState)
          nodeOutput = formatted
          nodeLogs = mockState.nodeLogs || []
          break
        }

        case "agentic_writer": {
          const sitePayload = wpCredentials
            ? {
                siteId: siteId || "00000000-0000-0000-0000-000000000000",
                wpSiteId: siteId || "00000000-0000-0000-0000-000000000000",
                baseUrl: wpCredentials.baseUrl,
                username: wpCredentials.username,
                applicationPassword: wpCredentials.applicationPassword,
              }
            : undefined

          const mockState = createMockWriterState({
            context: {
              request: createMockWriterRequest({
                engine: "agentic",
                content: {
                  keyword: params.keyword || "tips merawat tanaman hias monstera",
                  brief: params.brief,
                  wordCountTarget: params.wordCountTarget || 1000,
                  language: params.language || "id",
                  style: "default",
                },
                site: sitePayload as any,
                model: model || params.model || undefined,
                apiKey: apiKey || params.apiKey || undefined,
                customInstructions: params.customInstructions,
              }),
              llmService: new OpenRouterLlmService(apiKey || params.apiKey),
              promptConfig: {
                systemPrompt: "",
                userPromptTemplate: "",
                variables: {},
              },
            },
          })

          const result = await agenticWriterNode(mockState)
          nodeOutput = result
          nodeLogs = mockState.nodeLogs || []
          break
        }

        case "deepagent_writer": {
          const sitePayload = wpCredentials
            ? {
                siteId: siteId || "00000000-0000-0000-0000-000000000000",
                wpSiteId: siteId || "00000000-0000-0000-0000-000000000000",
                baseUrl: wpCredentials.baseUrl,
                username: wpCredentials.username,
                applicationPassword: wpCredentials.applicationPassword,
              }
            : undefined

          const mockState = createMockWriterState({
            context: {
              request: createMockWriterRequest({
                engine: "deepagent",
                content: {
                  keyword: params.keyword || "strategi investasi reksa dana untuk pemula",
                  brief: params.brief,
                  wordCountTarget: params.wordCountTarget || 1200,
                  language: params.language || "id",
                  style: "default",
                },
                site: sitePayload as any,
                model: model || params.model || undefined,
                apiKey: apiKey || params.apiKey || undefined,
                customInstructions: params.customInstructions,
              }),
              llmService: new OpenRouterLlmService(apiKey || params.apiKey),
              promptConfig: {
                systemPrompt: "",
                userPromptTemplate: "",
                variables: {},
              },
            },
          })

          const result = await deepAgentWriterNode(mockState)
          nodeOutput = result
          nodeLogs = mockState.nodeLogs || []
          break
        }

        default:
          return NextResponse.json(
            { ok: false, error: `Node target '${targetId}' tidak dikenal.` },
            { status: 400 }
          )
      }

      return NextResponse.json({
        ok: true,
        type: "node",
        targetId,
        durationMs: Date.now() - startTime,
        result: nodeOutput,
        nodeLogs,
      })
    }

    // ==========================================
    // 3. PENGUJIAN TIPE: ENGINE
    // ==========================================
    if (type === "engine") {
      const sitePayload = wpCredentials
        ? {
            siteId: siteId || "00000000-0000-0000-0000-000000000000",
            wpSiteId: siteId || "00000000-0000-0000-0000-000000000000",
            baseUrl: wpCredentials.baseUrl,
            username: wpCredentials.username,
            applicationPassword: wpCredentials.applicationPassword,
          }
        : {
            siteId: "00000000-0000-0000-0000-000000000000",
            wpSiteId: "00000000-0000-0000-0000-000000000000",
          }

      const writerResult = await run({
        engine: targetId || "quick",
        content: {
          keyword: params.keyword || "cara memulai blog wordpress",
          brief: params.brief,
          style: params.style || "default",
          language: params.language || "id",
        },
        site: sitePayload,
        publishing: {
          mode: params.actionStatus || "draft",
          categoryIds: params.categoryIds || [],
          tagNames: params.tagNames || [],
        },
        model: model || params.model || undefined,
        apiKey: apiKey || params.apiKey || undefined,
        customInstructions: params.customInstructions || params.brief,
      })

      return NextResponse.json({
        ok: writerResult.success,
        type: "engine",
        targetId,
        durationMs: Date.now() - startTime,
        result: writerResult,
      })
    }

    return NextResponse.json(
      { ok: false, error: `Tipe eksekusi '${type}' tidak didukung (harus 'tool', 'node', atau 'engine').` },
      { status: 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json(
      {
        ok: false,
        error: message,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
