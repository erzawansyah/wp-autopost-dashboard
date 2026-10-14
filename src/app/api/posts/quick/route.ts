import { NextResponse } from "next/server"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { processPostItem } from "@/core/queue/worker"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"

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

    const body = await request.json()
    const {
      siteId,
      keyword,
      category,
      category_ids,
      category_names,
      tags,
      customBrief,
      actionStatus = "draft",
      aiModel,
      reasoningEffort,
      agentProfileRef,
      engine = "quick",
      style = "default",
      language = "id",
    } = body

    if (!siteId || !keyword?.trim()) {
      return NextResponse.json(
        { error: "Website target dan kata kunci wajib dipilih/diisi." },
        { status: 400 }
      )
    }

    // 1. Verifikasi website tujuan milik pengguna
    const { data: site, error: siteError } = await supabase
      .from("wp_sites")
      .select("id, site_name, base_url, wp_username")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json(
        { error: "Website WordPress yang dipilih tidak ditemukan." },
        { status: 404 }
      )
    }

    // 2. Format taksonomi
    const tagList: string[] = Array.isArray(tags)
      ? tags.map((t: string) => String(t).trim()).filter(Boolean)
      : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : []

    const categoryList: string[] = Array.isArray(category_names) && category_names.length > 0
      ? category_names.map((c: string) => String(c).trim()).filter(Boolean)
      : category
      ? [String(category).trim()]
      : []

    const selectedCategoryIds: number[] = Array.isArray(category_ids)
      ? category_ids
          .map((id: unknown) => Number(id))
          .filter((id: number) => !isNaN(id) && id > 0)
      : []

    const effectiveProfileRef =
      agentProfileRef ||
      (engine ? LEGACY_ENGINE_MAP[engine] : undefined) ||
      "preset:quick-writer"

    // 3. Database-First State Machine: Buat entri awal di post_items (state: 'queued_input')
    const { data: initialPost, error: insertPostError } = await supabase
      .from("post_items")
      .insert({
        user_id: user.id,
        wp_site_id: site.id,
        target_keyword: keyword.trim(),
        state: "queued_input",
        wp_target_status: actionStatus,
        custom_instructions_override: customBrief || null,
        categories: categoryList,
        tags: tagList,
        source_payload: {
          agentProfileRef: effectiveProfileRef,
          engine,
          aiModel,
          reasoningEffort: reasoningEffort || undefined,
          style,
          language,
          category_ids: selectedCategoryIds,
        },
      })
      .select("id")
      .single()

    if (insertPostError || !initialPost) {
      return NextResponse.json(
        { error: `Gagal membuat antrean artikel di database: ${insertPostError?.message}` },
        { status: 500 }
      )
    }

    const postId = initialPost.id

    // Log awal pencatatan antrean
    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: user.id,
      step: "queue",
      level: "info",
      message: `[Queue] Artikel masuk antrean latar belakang (Agent: ${effectiveProfileRef}, Model: ${aiModel || "bawaan"}) untuk website ${site.site_name}`,
    })

    // 4. Jalankan Background Queue Worker via after() tanpa menahan response HTTP.
    //    Kunci OpenRouter tidak diterima dari browser: worker me-resolve kunci BYOK
    //    terenkripsi milik pengguna dari user_settings (getUserDecryptedKeys).
    after(async () => {
      try {
        await processPostItem({
          postId,
          userId: user.id,
        })
      } catch (workerErr) {
        console.error(`[Background Worker Error] Gagal memproses item #${postId}:`, workerErr)
      }
    })

    // 5. Kembalikan respons instan (< 200 ms) ke browser pengguna
    return NextResponse.json({
      ok: true,
      postId,
      state: "queued_input",
      targetSite: site.site_name,
      message: "Artikel berhasil masuk ke antrean latar belakang dan sedang diproses!",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
