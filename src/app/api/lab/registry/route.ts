import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

    // Ambil daftar website pengguna untuk memudahkan pengujian tools langsung
    const { data: sites } = await supabase
      .from("wp_sites")
      .select("id, site_name, base_url, wp_username, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    // Manifest Tools
    const tools = [
      {
        id: "get_categories",
        name: "Ambil Kategori (get_categories)",
        description: "Mengambil daftar seluruh kategori dari WordPress REST API via WP_REST_Controller.",
        requiresSite: true,
        defaultParams: {},
      },
      {
        id: "get_tags",
        name: "Ambil Tag (get_tags)",
        description: "Mengambil daftar seluruh tags yang telah terdaftar di WordPress REST API.",
        requiresSite: true,
        defaultParams: {},
      },
      {
        id: "create_tags",
        name: "Buat Tag Baru (create_tags)",
        description: "Membuat tag baru di WordPress berdasarkan nama resmi jika belum ada, atau mengembalikan ID tag jika sudah ada.",
        requiresSite: true,
        defaultParams: {
          tags: ["Teknologi", "Panduan AI", "Tips WordPress"],
        },
      },
      {
        id: "get_author",
        name: "Daftar Penulis (get_author)",
        description: "Mengambil daftar seluruh pengguna WordPress dengan role author/editor/administrator beserta ID dan bio mereka.",
        requiresSite: true,
        defaultParams: {},
      },
      {
        id: "wordpress_publisher",
        name: "Publikasi Naskah (wordpress_publisher)",
        description: "Mengirim artikel berformat Gutenberg Blocks ke WordPress REST API dengan status draft/publish/future.",
        requiresSite: true,
        defaultParams: {
          title: "Artikel Uji Coba Lab System Writer",
          contentHtml: "<!-- wp:paragraph -->\n<p>Ini adalah paragraf pengujian yang dikirim langsung dari Test Bench Laboratorium.</p>\n<!-- /wp:paragraph -->",
          status: "draft",
          tagNames: ["Panduan AI", "Tutorial WordPress"],
        },
      },
    ]

    // Manifest Nodes
    const nodes = [
      {
        id: "input_validator",
        name: "Node 1: Input Validator & Sanitizer",
        description: "Validasi skema WriterRequestSchema, sanitasi karakter kontrol, dan penetapan default values.",
        isAiNode: false,
        requiresSite: false,
        defaultInput: {
          keyword: "panduan seo wordpress 2026",
          brief: "Tuliskan tips praktis untuk optimasi kecepatan dan konten.",
          targetLanguage: "id",
          wordCountTarget: 1000,
        },
      },
      {
        id: "taxonomy_resolver",
        name: "Node 2: Taxonomy & Author Resolver",
        description: "Menghubungkan artikel ke kategori, tag, dan author yang relevan di WordPress melalui tools WP atau LLM matching.",
        isAiNode: true,
        requiresSite: true,
        defaultInput: {
          keyword: "tips optimasi core web vitals wordpress",
          brief: "Panduan teknis mempercepat loading website.",
          userCategoryIds: [],
          userTagNames: ["web-vitals", "speed"],
        },
      },
      {
        id: "article_drafter",
        name: "Node 3: Article Drafter (LLM Generator)",
        description: "Menghasilkan naskah artikel Markdown utuh berpedoman Anti-Slop Copywriting v3.0, Nol Dash, dan format terstruktur.",
        isAiNode: true,
        requiresSite: false,
        defaultInput: {
          keyword: "strategi konten website 2026",
          brief: "Fokus pada pembuatan konten bernilai tinggi untuk pembaca manusia.",
          wordCountTarget: 800,
          language: "id",
        },
      },
      {
        id: "quality_checker",
        name: "Node 4: Quality & Anti-Refusal Checker",
        description: "Mengevaluasi kelayakan naskah, mendeteksi penolakan chatbot percakapan ('Maaf saya AI...'), dan kelengkapan outline.",
        isAiNode: true,
        requiresSite: false,
        defaultInput: {
          title: "Strategi Konten Website Modern",
          keyword: "strategi konten website",
          contentText: "Berikut adalah panduan lengkap mengenai strategi konten modern yang berfokus pada pengalaman pembaca dan nilai praktis.",
        },
      },
      {
        id: "gutenberg_formatter",
        name: "Node 5: Gutenberg Block Formatter",
        description: "Mengonversi naskah Markdown menjadi blok native WordPress Gutenberg (`<!-- wp:heading -->`, `<!-- wp:paragraph -->`).",
        isAiNode: false,
        requiresSite: false,
        defaultInput: {
          markdownContent: "# Judul Utama\n\nIni adalah paragraf pengantar naskah.\n\n## Sub-bagian Pertama\n\n- Poin pertama yang praktis\n- Poin kedua dengan penjelasan ringkas\n\n> Kutipan penting untuk pembaca.\n",
        },
      },
    ]

    // Manifest Engines
    const engines = [
      {
        id: "quick",
        name: "Quick Engine (1-Shot LangGraph)",
        description: "Mesin penulisan artikel cepat (single-pass) menggunakan LangGraph StateGraph (InputValidator ➔ TaxonomyResolver ➔ ArticleDrafter ➔ QualityChecker ➔ GutenbergFormatter).",
        estimatedDurationSeconds: 15,
        defaultRequest: {
          keyword: "cara riset keyword seo pemula",
          brief: "Jelaskan langkah demi langkah riset keyword menggunakan search intent.",
          actionStatus: "draft",
          model: "openai/gpt-oss-120b",
        },
      },
    ]

    return NextResponse.json({
      ok: true,
      sites: sites || [],
      tools,
      nodes,
      engines,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
