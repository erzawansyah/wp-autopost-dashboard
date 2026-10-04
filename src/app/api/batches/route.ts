import { NextResponse } from "next/server"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { processPostItem } from "@/core/queue/worker"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import {
  calculateScheduleDates,
  ScheduleMode,
  RandomScheduleConfig,
  IntervalScheduleConfig,
  InstantScheduleConfig,
} from "@/lib/scheduler/date-calculator"

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
      batchName,
      keywords,
      scheduleMode = "interval",
      randomConfig,
      intervalConfig,
      instantConfig,
      agentProfileRef,
      engine = "quick",
      language = "id",
      category_ids = [],
      category_names = [],
      tags = [],
      customBrief = "",
      aiModel,
    } = body

    const effectiveProfileRef =
      agentProfileRef ||
      (engine ? LEGACY_ENGINE_MAP[engine] : undefined) ||
      "preset:quick-writer"

    if (!siteId) {
      return NextResponse.json(
        { error: "Situs WordPress target wajib dipilih." },
        { status: 400 }
      )
    }

    const rawItems: Array<{
      keyword?: string
      title?: string
      lsi?: string[]
      focus?: string
      category?: string
      tags?: string[]
    }> = Array.isArray(body.items) ? body.items : []

    // 1. Bersihkan dan filter kata kunci atau item
    let cleanItems: Array<{
      keyword: string
      title?: string
      lsi?: string[]
      focus?: string
      category?: string
      tags?: string[]
    }> = []

    if (rawItems.length > 0) {
      cleanItems = rawItems
        .map((it) => ({
          keyword: String(it.keyword || it.title || "").trim(),
          title: it.title ? String(it.title).trim() : undefined,
          lsi: Array.isArray(it.lsi) ? it.lsi.map(String).map((s) => s.trim()).filter(Boolean) : undefined,
          focus: it.focus ? String(it.focus).trim() : undefined,
          category: it.category ? String(it.category).trim() : undefined,
          tags: Array.isArray(it.tags) ? it.tags.map(String).map((s) => s.trim()).filter(Boolean) : undefined,
        }))
        .filter((it) => it.keyword.length > 0)
    }

    const cleanKeywords =
      cleanItems.length > 0
        ? cleanItems.map((it) => it.keyword)
        : Array.isArray(keywords)
        ? keywords
            .map((k: unknown) => String(k).trim())
            .filter((k: string) => k.length > 0)
        : []

    if (cleanKeywords.length === 0) {
      return NextResponse.json(
        { error: "Daftar kata kunci tidak boleh kosong. Masukkan minimal 1 kata kunci atau topik." },
        { status: 400 }
      )
    }

    if (cleanKeywords.length > 50) {
      return NextResponse.json(
        { error: "Maksimal 50 baris per batch. Silakan kurangi baris input Anda." },
        { status: 400 }
      )
    }

    // 2. Verifikasi website tujuan milik pengguna
    const { data: site, error: siteError } = await supabase
      .from("wp_sites")
      .select("id, site_name, base_url")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json(
        { error: "Website WordPress yang dipilih tidak ditemukan atau tidak memiliki hak akses." },
        { status: 404 }
      )
    }

    // 3. Kalkulasi jadwal tayang berdasarkan strategi
    const slots = calculateScheduleDates({
      mode: scheduleMode as ScheduleMode,
      itemCount: cleanKeywords.length,
      randomConfig: randomConfig as RandomScheduleConfig | undefined,
      intervalConfig: intervalConfig as IntervalScheduleConfig | undefined,
      instantConfig: instantConfig as InstantScheduleConfig | undefined,
    })

    // 4. Buat entri batch di content_batches
    const defaultBatchName =
      cleanKeywords.length === 1
        ? `Batch: ${cleanKeywords[0]}`
        : `Batch: ${cleanKeywords[0]} (+${cleanKeywords.length - 1} topik)`

    const effectiveExecutionMode =
      body.executionMode === "scheduled_drip" ? "scheduled_drip" : "immediate"

    const { data: batch, error: batchError } = await supabase
      .from("content_batches")
      .insert({
        user_id: user.id,
        wp_site_id: site.id,
        name: batchName?.trim() || defaultBatchName,
        source_type: "manual",
        execution_mode: effectiveExecutionMode,
        schedule_config: {
          executionMode: effectiveExecutionMode,
          mode: scheduleMode,
          randomConfig: scheduleMode === "random" ? randomConfig : undefined,
          intervalConfig: scheduleMode === "interval" ? intervalConfig : undefined,
          instantConfig: scheduleMode === "instant" ? instantConfig : undefined,
        },
        ai_config: {
          agentProfileRef: effectiveProfileRef,
          engine,
          aiModel,
          language,
          category_ids,
          category_names,
          tags,
        },
        custom_instructions_override: customBrief || null,
        status: "running",
        total_items: cleanKeywords.length,
        completed_items: 0,
      })
      .select("id, name, created_at")
      .single()

    if (batchError || !batch) {
      return NextResponse.json(
        { error: `Gagal membuat batch antrean: ${batchError?.message || "Kesalahan database"}` },
        { status: 500 }
      )
    }

    // 5. Susun seluruh baris post_items
    const tagList: string[] = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean)
      : typeof tags === "string"
      ? (tags as string).split(",").map((t) => t.trim()).filter(Boolean)
      : []

    const categoryList: string[] = Array.isArray(category_names)
      ? category_names.map((c) => String(c).trim()).filter(Boolean)
      : []

    const selectedCategoryIds: number[] = Array.isArray(category_ids)
      ? category_ids.map((id) => Number(id)).filter((id) => !isNaN(id) && id > 0)
      : []

    const itemsToInsert = cleanKeywords.map((kw, idx) => {
      const slot = slots[idx]
      const specificItem = cleanItems[idx]

      const itemTitle = specificItem?.title || null
      const itemLsi = specificItem?.lsi || []
      const itemFocus = specificItem?.focus || null
      const itemCategories = specificItem?.category
        ? [specificItem.category]
        : categoryList
      const itemTags = specificItem?.tags && specificItem.tags.length > 0
        ? Array.from(new Set([...tagList, ...specificItem.tags]))
        : tagList

      // Gabungkan instruksi artikel secara cerdas
      const instructionsParts: string[] = []
      if (itemLsi.length > 0) {
        instructionsParts.push(`Kata Kunci Sekunder / LSI yang WAJIB dimasukkan secara natural: ${itemLsi.join(", ")}`)
      }
      if (itemFocus) {
        instructionsParts.push(`Fokus Pembahasan / Catatan: ${itemFocus}`)
      }
      if (customBrief && customBrief.trim()) {
        instructionsParts.push(customBrief.trim())
      }
      const finalInstructions = instructionsParts.length > 0 ? instructionsParts.join("\n\n") : null

      return {
        batch_id: batch.id,
        user_id: user.id,
        wp_site_id: site.id,
        target_keyword: kw,
        title: itemTitle,
        state: "queued_input",
        scheduled_for: slot ? slot.scheduledFor.toISOString() : new Date().toISOString(),
        wp_target_status: slot?.wpTargetStatus || body.targetStatus || "publish",
        categories: itemCategories,
        tags: itemTags,
        custom_instructions_override: finalInstructions,
        source_payload: {
          agentProfileRef: effectiveProfileRef,
          engine,
          aiModel,
          language,
          category_ids: selectedCategoryIds,
          batch_name: batch.name,
          schedule_mode: scheduleMode,
          execution_mode: effectiveExecutionMode,
          slot_index: idx,
          lsi: itemLsi.length > 0 ? itemLsi : undefined,
          customTitle: itemTitle || undefined,
          focus: itemFocus || undefined,
        },
      }
    })

    const { data: insertedItems, error: itemsError } = await supabase
      .from("post_items")
      .insert(itemsToInsert)
      .select("id, target_keyword, scheduled_for, state")

    if (itemsError || !insertedItems) {
      return NextResponse.json(
        { error: `Batch terbuat tapi gagal menyisipkan item: ${itemsError?.message}` },
        { status: 500 }
      )
    }

    // 6. Jika mode immediate dan ada item, picu eksekusi artikel pertama di background
    if (effectiveExecutionMode === "immediate" && insertedItems.length > 0) {
      const firstItemId = insertedItems[0].id
      after(async () => {
        try {
          await processPostItem({ postId: firstItemId, userId: user.id })
        } catch (err) {
          console.error("[POST /api/batches] Error background trigger item pertama:", err)
        }
      })
    }

    return NextResponse.json({
      success: true,
      batch: {
        id: batch.id,
        name: batch.name,
        totalItems: cleanKeywords.length,
        executionMode: scheduleMode,
      },
      slotsPreview: slots.slice(0, 5),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)

    const { data: batches, error } = await supabase
      .from("content_batches")
      .select(`
        id,
        name,
        source_type,
        execution_mode,
        status,
        total_items,
        completed_items,
        schedule_config,
        created_at,
        updated_at,
        wp_sites (
          id,
          site_name,
          base_url
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Periksa apakah pengguna memiliki artikel dari Tulis Cepat (Quick Writer) yang tidak masuk batch masal
    const { data: standaloneItems, count: standaloneCount } = await supabase
      .from("post_items")
      .select("id, state, created_at, wp_sites ( id, site_name, base_url )", { count: "exact" })
      .eq("user_id", user.id)
      .is("batch_id", null)
      .order("created_at", { ascending: false })

    let allBatches = batches || []
    const totalQuick = standaloneCount || 0

    if (totalQuick > 0) {
      const completedQuick = (standaloneItems || []).filter((item) =>
        item.state === "published_on_wp" ||
        item.state === "saved_draft_on_wp" ||
        item.state === "scheduled_on_wp"
      ).length

      const hasGenerating = (standaloneItems || []).some(
        (item) => item.state === "generating_content" || item.state === "syncing_to_wp"
      )

      const latestItem = standaloneItems?.[0]
      const wpSite = Array.isArray(latestItem?.wp_sites) ? latestItem?.wp_sites[0] : latestItem?.wp_sites

      const quickWriterBatch = {
        id: "quick-writer",
        name: "Tulis Cepat (Quick Writer)",
        source_type: "quick_writer",
        execution_mode: "instant",
        status: hasGenerating ? "running" : "completed",
        total_items: totalQuick,
        completed_items: completedQuick,
        schedule_config: { mode: "instant" },
        created_at: latestItem?.created_at || new Date().toISOString(),
        updated_at: latestItem?.created_at || new Date().toISOString(),
        wp_sites: wpSite ? [wpSite] : [],
      }

      allBatches = [quickWriterBatch, ...(batches || [])] as any
    }

    return NextResponse.json({ batches: allBatches })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    let batchId = searchParams.get("id")

    if (!batchId) {
      try {
        const body = await request.json()
        batchId = body.id
      } catch {
        // Abaikan jika tidak ada body JSON
      }
    }

    if (!batchId) {
      return NextResponse.json({ error: "ID Batch wajib disertakan." }, { status: 400 })
    }

    // Jika yang dihapus adalah grup virtual Tulis Cepat
    if (batchId === "quick-writer") {
      const { error: deleteQuickErr } = await supabase
        .from("post_items")
        .delete()
        .is("batch_id", null)
        .eq("user_id", user.id)

      if (deleteQuickErr) {
        return NextResponse.json({ error: deleteQuickErr.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: "Seluruh riwayat artikel Tulis Cepat berhasil dihapus.",
      })
    }

    // 1. Hapus semua post_items yang terkait dengan batch ini milik user
    const { error: deleteItemsErr } = await supabase
      .from("post_items")
      .delete()
      .eq("batch_id", batchId)
      .eq("user_id", user.id)

    if (deleteItemsErr) {
      console.warn("[DELETE /api/batches] Gagal menghapus post_items terkait:", deleteItemsErr)
    }

    // 2. Hapus entri content_batches
    const { error: deleteBatchErr } = await supabase
      .from("content_batches")
      .delete()
      .eq("id", batchId)
      .eq("user_id", user.id)

    if (deleteBatchErr) {
      return NextResponse.json({ error: deleteBatchErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Batch dan seluruh item antreannya berhasil dihapus.",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
