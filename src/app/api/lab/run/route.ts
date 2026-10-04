import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { hasLabAccess } from "@/lib/constants/auth"
import { ToolRegistry } from "@/core/writer/tools"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { publishPostToWordPress } from "@/core/shared/tools/wordpress-publisher"
import { webSearch } from "@/core/shared/tools/web-search"
import { searchRoyaltyFreeImages } from "@/core/shared/tools/image-search"
import { getKeywordSuggestions } from "@/core/shared/tools/keyword-suggestions"
import { readWebContent } from "@/core/shared/tools/web-reader"
import { run } from "@/core/writer"
import { AgentStepEvent, RunRecorder } from "@/core/writer/runtime/telemetry"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const authorized = await hasLabAccess(supabase, user)
    if (!authorized) {
      return NextResponse.json(
        { error: "Forbidden: Aktifkan Developer Mode di Pengaturan Profil untuk mengakses Laboratorium" },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const type = body.type
    const id = body.targetId || body.id
    const siteId = body.siteId
    const input = body.params || body.input || {}
    const requestedModel = body.model || input?.model
    const requestedApiKey = body.apiKey || input?.apiKey

    if (!type || !id) {
      return NextResponse.json({ error: "Parameter type dan targetId/id wajib disertakan." }, { status: 400 })
    }

    // Ambil kredensial situs jika siteId disertakan
    let site: any = null
    let plainPassword = ""
    if (siteId) {
      const { data: siteData } = await supabase
        .from("wp_sites")
        .select("*")
        .eq("id", siteId)
        .eq("user_id", user.id)
        .single()

      if (siteData) {
        site = siteData
        try {
          plainPassword = decryptCredential(siteData.encrypted_app_password)
        } catch {
          // Password decryption failed
        }
      }
    }

    const userKeys = await getUserDecryptedKeys(user.id)
    const startTime = Date.now()

    // 1. EKSEKUSI PENGUJIAN TOOL INDEPENDEN
    if (type === "tool") {
      if (id === "wordpress_publisher") {
        if (!site || !plainPassword) {
          return NextResponse.json({ error: "Situs WordPress yang valid wajib dipilih untuk menguji publisher." }, { status: 400 })
        }
        const pubResult = await publishPostToWordPress({
          baseUrl: site.base_url,
          username: site.wp_username,
          applicationPassword: plainPassword,
          article: {
            title: input?.title || "Test Artikel Lab",
            contentHtml: input?.contentHtml || "<p>Uji coba lab</p>",
            excerpt: input?.excerpt || "",
          },
          metadata: {
            status: input?.status || "draft",
          },
        })

        return NextResponse.json({
          ok: pubResult.ok,
          output: pubResult,
          durationMs: Date.now() - startTime,
        })
      }

      if (id === "web_search") {
        const query = (input?.query || "").trim()
        const limit = Number(input?.limit) || 4
        const language = input?.language || "id"
        const provider = input?.provider || userKeys.searchPreferences?.default_provider || "auto"
        const apiKey = userKeys.tavilyKey || userKeys.braveKey || userKeys.serpapiKey
        const searxngUrl = userKeys.searxngUrl || "http://searxng-internal:8080"

        const results = await webSearch({
          query,
          limit,
          language,
          provider,
          apiKey,
          searxngUrl,
        })

        const webOutput = {
          query,
          totalResults: results.length,
          results,
        }

        return NextResponse.json({
          ok: true,
          result: webOutput,
          output: webOutput,
          summary: `Ditemukan ${results.length} sumber referensi web`,
          durationMs: Date.now() - startTime,
        })
      }

      if (id === "image_search") {
        const query = (input?.query || "").trim()
        const count = Number(input?.count) || 3
        const minWidth = Number(input?.minWidth) || 1280
        const provider = input?.provider || "auto"
        const searxngUrl = userKeys.searxngUrl || "http://searxng-internal:8080"

        const photos = await searchRoyaltyFreeImages({
          query,
          count,
          orientation: "landscape",
          minWidth,
          provider,
          pexafyApiKey: userKeys.pexafyKey,
          searxngUrl,
        })

        const imgOutput = {
          query,
          totalPhotos: photos.length,
          photos,
        }

        return NextResponse.json({
          ok: true,
          result: imgOutput,
          output: imgOutput,
          summary: `Ditemukan ${photos.length} foto berkualitas tinggi`,
          durationMs: Date.now() - startTime,
        })
      }

      if (id === "keyword_suggestions") {
        const query = (input?.query || "").trim()
        const limit = Number(input?.limit) || 15
        const language = input?.language || "id"
        const searxngUrl = userKeys.searxngUrl || "http://searxng-internal:8080"

        const res = await getKeywordSuggestions({
          query,
          limit,
          language,
          searxngUrl,
        })

        return NextResponse.json({
          ok: true,
          result: res,
          output: res,
          summary: `Ditemukan ${res.suggestions.length} saran kata kunci & LSI`,
          durationMs: Date.now() - startTime,
        })
      }

      if (id === "web_reader") {
        const url = (input?.url || "").trim()
        const maxLength = Number(input?.maxLength) || 2500
        const res = await readWebContent({ url, maxLength })

        return NextResponse.json({
          ok: res.ok,
          result: res,
          output: res,
          summary: res.ok ? `Membaca ${res.wordCount} kata dari ${res.title || url}` : res.error,
          durationMs: Date.now() - startTime,
        })
      }

      // Ambil tool dari ToolRegistry universal
      const toolDef = ToolRegistry.get(id)
      if (!toolDef) {
        return NextResponse.json({ error: `Tool dengan ID '${id}' tidak ditemukan di ToolRegistry.` }, { status: 404 })
      }

      const toolInstance = toolDef.build({
        userKeys,
        wpCredentials: site && plainPassword
          ? {
              baseUrl: site.base_url,
              username: site.wp_username,
              applicationPassword: plainPassword,
            }
          : undefined,
        language: input?.language || "id",
        recorder: new RunRecorder(),
      })

      try {
        const rawOutput = await toolInstance.invoke(input || {})
        let parsedOutput: unknown = rawOutput
        if (typeof rawOutput === "string") {
          try {
            parsedOutput = JSON.parse(rawOutput)
          } catch {
            parsedOutput = rawOutput
          }
        }

        return NextResponse.json({
          ok: true,
          result: parsedOutput,
          output: parsedOutput,
          summary: toolDef.summarize ? toolDef.summarize(rawOutput) : undefined,
          durationMs: Date.now() - startTime,
        })
      } catch (toolErr: unknown) {
        const message = toolErr instanceof Error ? toolErr.message : "Kesalahan eksekusi tool"
        return NextResponse.json({
          ok: false,
          error: message,
          durationMs: Date.now() - startTime,
        })
      }
    }

    // 2. EKSEKUSI PENGUJIAN AGENT / PRESET PIPELINE
    if (type === "engine" || type === "agent") {
      const stepEvents: AgentStepEvent[] = []
      const onEventListener = (ev: AgentStepEvent) => {
        stepEvents.push(ev)
      }

      const result = await run({
        agentProfileRef: id,
        content: {
          keyword: input?.keyword || "tips optimasi wordpress",
          brief: input?.brief || undefined,
          style: input?.style || "default",
          language: input?.language || "id",
        },
        site: site
          ? {
              siteId: site.id,
              baseUrl: site.base_url,
              username: site.wp_username,
              applicationPassword: plainPassword,
            }
          : undefined,
        publishing: {
          mode: input?.actionStatus || "draft",
          categoryIds: [],
          tagNames: [],
        },
        model: requestedModel || input?.model || undefined,
        apiKey: requestedApiKey || input?.apiKey || userKeys.openrouterKey || undefined,
        userId: user.id,
        onEventListener,
      })

      const enginePayload = {
        article: result.article,
        enrichment: result.enrichment,
        execution: {
          ...result.execution,
          stepEvents,
        },
        error: result.error,
      }

      return NextResponse.json({
        ok: result.success,
        result: enginePayload,
        output: enginePayload,
        article: result.article,
        enrichment: result.enrichment,
        execution: {
          ...result.execution,
          stepEvents,
        },
        error: result.error?.message,
        durationMs: Date.now() - startTime,
      })
    }

    return NextResponse.json({ error: `Tipe pengujian '${type}' tidak didukung.` }, { status: 400 })
  } catch (err: unknown) {
    console.error("[Lab/run] Unhandled error:", err)
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal lab"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
