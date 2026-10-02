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
      {
        id: "web_search",
        name: "Penelusuran Web (web_search)",
        description: "Tool independen untuk mencari fakta, data, dan artikel rujukan di web (Tavily, Brave Search, Bing Scraper, Open Knowledge).",
        requiresSite: false,
        defaultParams: {
          query: "teknik menyeduh kopi v60",
          limit: 3,
        },
      },
      {
        id: "web_reader",
        name: "Pembaca Konten URL (web_reader)",
        description: "Tool ekstraksi teks artikel dari URL web dengan proteksi SSRF dan sanitasi HTML.",
        requiresSite: false,
        defaultParams: {
          url: "https://id.wikipedia.org/wiki/Kopi",
          maxLength: 1500,
        },
      },
      {
        id: "image_search",
        name: "Pencari Foto Bebas Royalti (image_search)",
        description: "Tool pencari foto resolusi tinggi bebas royalti (Hybrid: Bing Images Creative Commons, Azure API, Pexels, Unsplash).",
        requiresSite: false,
        defaultParams: {
          query: "pour over coffee barista",
          count: 2,
        },
      },
      {
        id: "image_embedder",
        name: "Penyemat Gambar Markdown (image_embedder)",
        description: "Tool deterministik untuk menyisipkan gambar dengan tag markdown dan caption tepat di bawah heading H2 terkait.",
        requiresSite: false,
        defaultParams: {
          markdown: "## Alat Manual Brew\n\nDripper V60 merupakan alat yang populer.\n",
          images: [
            {
              subheading: "Alat Manual Brew",
              imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd",
              altText: "Dripper V60",
              caption: "Ilustrasi dripper V60",
            },
          ],
        },
      },
      {
        id: "upload_media",
        name: "Unggah Media ke WordPress (upload_media)",
        description: "Mengunduh gambar dari URL dan mengunggahnya ke WordPress Media Library via REST API standar (/wp-json/wp/v2/media).",
        requiresSite: true,
        defaultParams: {
          imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd",
          title: "Dripper Kopi V60",
          altText: "Dripper kopi manual brew V60",
          caption: "Ilustrasi dripper V60",
        },
      },
    ]

    // Manifest Nodes
    const nodes = [
      {
        id: "input_validator",
        name: "Input Validator & Sanitizer",
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
        name: "Taxonomy & Author Resolver",
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
        id: "topic_researcher",
        name: "Topic Researcher & Content Blueprint",
        description: "Menganalisis search intent, target audiens, entitas semantik (LSI), dan merancang outline terstruktur beserta rekomendasi pencarian foto.",
        isAiNode: true,
        requiresSite: false,
        defaultInput: {
          keyword: "panduan menyeduh kopi manual brew",
          brief: "Bahas metode V60, French Press, dan rasio air kopi.",
          language: "id",
        },
      },
      {
        id: "article_drafter",
        name: "Article Drafter (LLM Generator)",
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
        id: "image_curator",
        name: "Image Curator & WordPress Uploader",
        description: "Agent kurator visual LangChain yang merumuskan query foto dari artikel atau brief, mencari dan menyeleksi gambar berkualitas, mengunggah ke WordPress, dan menyajikan ringkasan aset gambar (ID, URL, & panduan penggunaan).",
        isAiNode: true,
        requiresSite: false,
        defaultInput: {
          keyword: "kopi manual brew",
          promptContent: "Brief Konten: Panduan menyeduh kopi manual brew untuk pemula. Membahas alat seduh V60, french press, dan teknik menuang air yang seimbang.",
        },
      },
      {
        id: "quality_checker",
        name: "Quality & Anti-Refusal Checker",
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
        name: "Gutenberg Block Formatter",
        description: "Mengonversi naskah Markdown menjadi blok native WordPress Gutenberg (`<!-- wp:heading -->`, `<!-- wp:paragraph -->`).",
        isAiNode: false,
        requiresSite: false,
        defaultInput: {
          markdownContent: "# Judul Utama\n\nIni adalah paragraf pengantar naskah.\n\n## Sub-bagian Pertama\n\n- Poin pertama yang praktis\n- Poin kedua dengan penjelasan ringkas\n\n> Kutipan penting untuk pembaca.\n",
        },
      },
      {
        id: "agentic_writer",
        name: "Agentic Writer (Autonomous Tools)",
        description: "LangChain Autonomous Agent yang memilih dan mengeksekusi tools (web search, web reader, image search, WP upload) secara mandiri untuk riset dan penulisan naskah artikel utuh.",
        isAiNode: true,
        requiresSite: true,
        defaultInput: {
          keyword: "tips merawat tanaman hias monstera",
          brief: "Bahas cara penyiraman, pencahayaan, dan pencegahan hama.",
          wordCountTarget: 1000,
          language: "id",
        },
      },
      {
        id: "deepagent_writer",
        name: "DeepAgent Writer (LangChain Deep Agents)",
        description: "Framework resmi LangChain Deep Agents dengan Todo Planning (write_todos), Filesystem context, On-demand Skills, dan tools otonom web & media.",
        isAiNode: true,
        requiresSite: true,
        defaultInput: {
          keyword: "strategi investasi reksa dana untuk pemula",
          brief: "Bahas profil risiko, diversifikasi aset, dan simulasi keuntungan.",
          wordCountTarget: 1200,
          language: "id",
        },
      },
    ]

    // Manifest Engines
    const engines = [
      {
        id: "deepagent",
        name: "DeepAgent Writer (LangChain Deep Agents)",
        description: "Pipeline otonom canggih bertenaga framework resmi LangChain Deep Agents dengan kapabilitas Todo planning, filesystem context, on-demand skills, dan integrasi WordPress.",
        estimatedDurationSeconds: 45,
        supportsFeaturedImage: true,
        supportsInContentImages: true,
        supportsResearch: true,
        defaultRequest: {
          keyword: "panduan investasi saham untuk pemula",
          brief: "Fokus pada tips fundamental, analisis rasio sederhana, dan psikologi trading.",
          actionStatus: "draft",
          model: "openai/gpt-oss-120b",
        },
      },
      {
        id: "agentic",
        name: "Agentic Writer (Autonomous ReAct Agent)",
        description: "Pipeline 3-node otonom bertenaga LangChain ReAct Agent yang secara fleksibel memilih kapan perlu riset web, kapan perlu kurasi dan upload gambar ke WordPress, dan menghasilkan artikel Markdown.",
        estimatedDurationSeconds: 30,
        supportsFeaturedImage: true,
        supportsInContentImages: true,
        supportsResearch: true,
        defaultRequest: {
          keyword: "panduan investasi saham untuk pemula",
          brief: "Fokus pada tips fundamental, analisis rasio sederhana, dan psikologi trading.",
          actionStatus: "draft",
          model: "openai/gpt-oss-120b",
        },
      },
      {
        id: "standard",
        name: "Standard Engine (Riset & Gambar)",
        description: "Mesin penulisan artikel berimbang dengan riset topik mendalam, outline entitas semantik, kurasi Featured Image sampul, dan penyematan gambar in-content otomatis.",
        estimatedDurationSeconds: 40,
        supportsFeaturedImage: true,
        supportsInContentImages: true,
        supportsResearch: true,
        defaultRequest: {
          keyword: "panduan lengkap manual brew untuk pemula",
          brief: "Ulas metode V60 dan AeroPress dengan takaran rasio yang pas.",
          actionStatus: "draft",
          model: "openai/gpt-oss-120b",
        },
      },
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
