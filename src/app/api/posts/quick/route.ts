import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { generateArticle } from "@/core/writer"
import { createWordPressPost, resolveOrCreateWordPressTags } from "@/lib/wordpress/client"

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
      apiKey,
    } = body

    if (!siteId || !keyword?.trim()) {
      return NextResponse.json(
        { error: "Website target dan kata kunci wajib dipilih/diisi." },
        { status: 400 }
      )
    }

    // 1. Ambil data website & kredensial
    const { data: site, error: siteError } = await supabase
      .from("wp_sites")
      .select("id, site_name, base_url, wp_username, encrypted_app_password")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json(
        { error: "Website WordPress yang dipilih tidak ditemukan." },
        { status: 404 }
      )
    }

    // Dekripsi application password di memori server
    let plainPassword = ""
    try {
      plainPassword = decryptCredential(site.encrypted_app_password)
    } catch {
      return NextResponse.json(
        { error: "Gagal mendekripsi kredensial website WordPress. Harap daftarkan ulang situs." },
        { status: 500 }
      )
    }

    // 2. Database-First State Machine: Buat entri awal di post_items
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

    const { data: initialPost, error: insertPostError } = await supabase
      .from("post_items")
      .insert({
        user_id: user.id,
        wp_site_id: site.id,
        target_keyword: keyword.trim(),
        state: "generating_content",
        wp_target_status: actionStatus,
        custom_instructions_override: customBrief || null,
        categories: categoryList,
        tags: tagList,
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

    // Log awal
    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: user.id,
      step: "generation",
      level: "info",
      message: `Memulai pembuatan artikel AI untuk kata kunci: ${keyword}`,
    })

    // 3. Generate konten dengan AI OpenRouter
    let generated
    try {
      generated = await generateArticle({
        keyword: keyword.trim(),
        category: categoryList.length > 0 ? categoryList.join(", ") : undefined,
        tags: tagList.length > 0 ? tagList.join(", ") : undefined,
        customBrief,
        model: aiModel || undefined,
        apiKey: apiKey || undefined,
      })
    } catch (aiErr: unknown) {
      const errMsg = aiErr instanceof Error ? aiErr.message : "Kesalahan AI OpenRouter"
      await supabase
        .from("post_items")
        .update({
          state: "failed_generation",
          last_error: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId)

      await supabase.from("execution_logs").insert({
        post_item_id: postId,
        user_id: user.id,
        step: "generation",
        level: "error",
        message: `Gagal generate artikel AI: ${errMsg}`,
      })

      return NextResponse.json(
        { error: `Gagal membuat artikel AI: ${errMsg}`, postId },
        { status: 502 }
      )
    }

    // 4. Update status post_items ke ready_to_sync / syncing_to_wp
    await supabase
      .from("post_items")
      .update({
        title: generated.title,
        content_html: generated.contentHtml,
        excerpt: generated.excerpt,
        state: "syncing_to_wp",
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)

    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: user.id,
      step: "post_creation",
      level: "info",
      message: `Menyelesaikan tag dan mengirim artikel ke WordPress REST API (${actionStatus})...`,
    })

    // Selesaikan atau buat tag otomatis di WordPress
    let resolvedTagIds: number[] = []
    if (tagList.length > 0) {
      try {
        resolvedTagIds = await resolveOrCreateWordPressTags({
          baseUrl: site.base_url,
          username: site.wp_username,
          applicationPassword: plainPassword,
          tagNames: tagList,
        })
      } catch (tagErr) {
        console.warn("Gagal menyelesaikan tag WordPress:", tagErr)
      }
    }

    const selectedCategoryIds: number[] = Array.isArray(category_ids)
      ? category_ids
          .map((id: unknown) => Number(id))
          .filter((id: number) => !isNaN(id) && id > 0)
      : []

    // 5. Kirim artikel ke WordPress REST API
    const wpResult = await createWordPressPost({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: plainPassword,
      post: {
        title: generated.title,
        content: generated.contentHtml,
        excerpt: generated.excerpt,
        status: actionStatus,
        categories: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
        tags: resolvedTagIds.length > 0 ? resolvedTagIds : undefined,
      },
    })

    if (!wpResult.ok) {
      // Catat failed_sync (konten AI tetap tersimpan aman di database!)
      await supabase
        .from("post_items")
        .update({
          state: "failed_sync",
          last_error: wpResult.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId)

      await supabase.from("execution_logs").insert({
        post_item_id: postId,
        user_id: user.id,
        step: "post_creation",
        level: "error",
        message: `Gagal mengirim ke WordPress: ${wpResult.error}`,
      })

      return NextResponse.json(
        {
          error: `Artikel berhasil di-generate, namun gagal disinkronkan ke WordPress: ${wpResult.error}`,
          postId,
          generatedTitle: generated.title,
        },
        { status: 502 }
      )
    }

    // 6. Sinkronisasi sukses!
    const finalState = actionStatus === "publish" ? "published_on_wp" : "saved_draft_on_wp"
    await supabase
      .from("post_items")
      .update({
        state: finalState,
        wp_post_id: wpResult.wpPostId,
        wp_post_url: wpResult.wpPostUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)

    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: user.id,
      step: "status_sync",
      level: "info",
      message: `Artikel sukses terkirim ke WordPress (${finalState}) dengan ID ${wpResult.wpPostId}`,
      details: { url: wpResult.wpPostUrl },
    })

    return NextResponse.json({
      ok: true,
      postId,
      title: generated.title,
      state: finalState,
      wpPostId: wpResult.wpPostId,
      wpPostUrl: wpResult.wpPostUrl,
      readingTimeMinutes: generated.readingTimeMinutes,
      modelUsed: generated.modelUsed,
      message:
        actionStatus === "publish"
          ? "Artikel berhasil diterbitkan ke WordPress secara live!"
          : "Artikel berhasil disimpan sebagai draft di WordPress!",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
