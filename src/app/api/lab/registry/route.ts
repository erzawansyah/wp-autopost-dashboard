import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hasLabAccess } from "@/lib/constants/auth"
import { BUILTIN_PRESETS } from "@/core/writer/profiles"
import { ToolRegistry } from "@/core/writer/tools"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"

export async function GET() {
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

    // Ambil daftar website pengguna untuk memudahkan pengujian tools langsung
    const { data: sites } = await supabase
      .from("wp_sites")
      .select("id, site_name, base_url, wp_username, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    // Ambil profil kustom user
    const { data: userProfiles } = await supabase
      .from("agent_profiles")
      .select("id, name, description, mode, model, tool_ids")
      .eq("user_id", user.id)
      .eq("is_archived", false)

    // Manifest Tools dari ToolRegistry universal
    const allTools = ToolRegistry.getAll()
    const tools = allTools.map((t) => {
      let defaultParams: Record<string, unknown> = {}
      if (t.id === "web_search") {
        defaultParams = { query: "perkembangan artificial intelligence indonesia" }
      } else if (t.id === "keyword_suggestions") {
        defaultParams = { query: "kopi robusta", limit: 15 }
      } else if (t.id === "web_reader") {
        defaultParams = { url: "https://example.com" }
      } else if (t.id === "image_search") {
        defaultParams = { query: "modern artificial intelligence workspace" }
      } else if (t.id === "upload_media") {
        defaultParams = {
          imageUrl: "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg",
          altText: "Contoh foto teknologi",
          isFeatured: true,
        }
      } else if (t.id === "set_featured_image") {
        defaultParams = { query: "modern workspace technology", altText: "Featured image sampul" }
      }

      const requiresSite = (t.requirements || []).some((r) => r.type === "wp_site")

      return {
        id: t.id,
        name: t.label,
        description: t.description,
        requiresSite,
        defaultParams,
        inputFields: t.inputFields || [],
      }
    })

    // Tambahkan tool publisher untuk uji kirim naskah ke WordPress
    tools.push({
      id: "wordpress_publisher",
      name: "WordPress Publisher (Direct Test)",
      description: "Mengirim artikel berformat Gutenberg Blocks ke WordPress REST API dengan status draft/publish/future.",
      requiresSite: true,
      defaultParams: {
        title: "Artikel Uji Coba dari Laboratorium",
        contentHtml: "<!-- wp:paragraph -->\n<p>Ini adalah paragraf pengujian penerbitan naskah WordPress dari Dev Lab.</p>\n<!-- /wp:paragraph -->",
        status: "draft",
        excerpt: "Ringkasan uji coba laboratorium...",
      },
      inputFields: [
        {
          name: "title",
          label: "Judul Artikel",
          type: "text",
          defaultValue: "Artikel Uji Coba dari Laboratorium",
          description: "Judul postingan yang akan dibuat di WordPress.",
        },
        {
          name: "status",
          label: "Status Publikasi",
          type: "select",
          defaultValue: "draft",
          options: [
            { value: "draft", label: "Draft (Simpan sebagai Konsep)" },
            { value: "publish", label: "Publish (Tayang Langsung)" },
          ],
        },
        {
          name: "contentHtml",
          label: "Konten HTML / Gutenberg Blocks",
          type: "textarea",
          defaultValue: "<!-- wp:paragraph -->\n<p>Ini adalah paragraf pengujian penerbitan naskah WordPress dari Dev Lab.</p>\n<!-- /wp:paragraph -->",
          description: "Markup HTML atau komentar blok Gutenberg yang akan disuntikkan ke wp/v2/posts.",
        },
      ],
    })

    // Daftar Agent Profiles (Presets + Kustom)
    const customProfiles = (userProfiles || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || "",
      mode: p.mode,
      toolCount: (p.tool_ids || []).length,
      isPreset: false,
      defaultRequest: {
        keyword: "panduan investasi saham untuk pemula",
        brief: "Fokus pada tips fundamental dan diversifikasi portofolio.",
        actionStatus: "draft",
        model: ("model" in p && typeof p.model === "string" && p.model) ? p.model : DEFAULT_AI_MODEL,
      },
    }))

    const presetProfiles = BUILTIN_PRESETS.map((p) => ({
      id: p.ref,
      name: p.name,
      description: p.description,
      mode: p.mode,
      toolCount: p.toolIds.length,
      isPreset: true,
      defaultRequest: {
        keyword: "cara merawat tanaman hias di dalam ruangan",
        brief: "Berikan tips pencahayaan, penyiraman, dan pemupukan yang ideal.",
        actionStatus: "draft",
        model: DEFAULT_AI_MODEL,
      },
    }))

    const engines = [...presetProfiles, ...customProfiles]

    return NextResponse.json({
      ok: true,
      sites: sites || [],
      tools,
      nodes: [], // Dikosongkan karena node-based arsitektur sudah dihapus
      engines,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
