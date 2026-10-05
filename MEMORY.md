# MEMORY.md — Living Project Memory & State Index

Dokumen ini adalah **Memori Dinamis Proyek (Living Memory)** untuk seluruh AI Agent. Berbeda dengan [`AGENTS.md`](file:///d:/Antigravity/wp-autopost-dashboard/AGENTS.md) yang bersifat statik/kebijakan, file ini mencatat status terkini proyek, riwayat keputusan arsitektur (*ADR*), dan catatan teknis penting (*gotchas*) agar tidak terulang di sesi berikutnya.

---

## 1. Status Proyek Saat Ini

- **Tahap Selesai**: **MVP Minimal, Multi-Select Kategori WP, Resolusi Tag, BYOK Settings, Retry Sinkronisasi WP, Factory System Writer, Lab Pengujian (/lab), UI Tulis Cepat (/posts/new), Queue Worker, Standard Writing Engine, Hybrid Scraper Tools, Dynamic OpenRouter Models, Featured Image WP, Modul 2 Batch Keyword Ingestion, Agentic Writer Engine, Multi-Language Selection, Integrasi user_settings & webhooks, Perombakan Arsitektur Total ke Agent Profile Runtime, Modul Artikel Terjadwal (/scheduled), Skill Registry (/skills), Sentralisasi Kunci API (/settings/keys), Revamp Gambar (SearxNG + Pexafy), dan Konsolidasi Sidebar WP Tools (/tools)**.
- **Catatan Worklog**: [`00`-`24`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/) · [`25`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/25-scheduled-articles-skills-and-tools.md) · [`26`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/26-api-keys-hub-searxng-pexafy-wptools.md) *(terbaru)*
- **Fase Aktif**: **Unified BYOK Hub (/settings/keys), SearxNG & Pexafy Pipeline, WP Tools Hub (/tools) LIVE**.
- **Fase Berikutnya**: **Modul 3 Niche Auto-Genesis & Smart Content Recycling**.

---

## 2. Catatan Keputusan Arsitektur yang Telah Disepakati (ADR Summary)

1. **ADR-001 s/d ADR-010**: Fondasi awal Next.js root, WP REST zero-plugin, OpenRouter, cost-saver retry, sandbox `.workspaces/`, 3 modul ingesti, tri-mode image, drip-feed scheduler.
2. **ADR-011 s/d ADR-020**: WP authorize redirect callback, taksonomi dinamis, prompt versioning, table-only queue, 35 REST APIs, single-page Tulis Cepat, multi-select kategori, LangChain transisi.
3. **ADR-021 s/d ADR-025**: Konsolidasi baseline writer, extensible system writer, retry sinkronisasi WP, global TooltipProvider, konsolidasi BYOK settings.
4. **ADR-026 s/d ADR-040**: Prompt templating `prompt.md`, Laboratorium `/lab`, `PageContainer` & `PageHeader`, Standard Engine, Hybrid Image & Web Scraper, BYOK Search, Agentic Topic Researcher, Dynamic OpenRouter models, WP Featured Image, Engine-Centric Prompts, Batch Keyword Ingestion.
5. **ADR-041 s/d ADR-046**: Atomic Claim Lock queue dispatch, async dispatch `after()`, Agentic Writer Engine, global multi-language selection, BYOK user_settings, outbound webhooks.
6. **ADR-047 (Perombakan Arsitektur Total ke Agent Profile Runtime)**: Eliminasi node/engine kaku, implementasi LangChain `createAgent` & Deep Agents, Universal Tools, Anti-Loop & Telemetri padat, UI `/agents`.
7. **ADR-048 (Modul Artikel Terjadwal, Skill Registry, dan Kategori Menu Tools)**: Artikel terjadwal sequential, registry SKILL.md, default quick-writer.
8. **ADR-049 (Sentralisasi Kunci API, SearxNG + Pexafy, & Konsolidasi Sidebar WP Tools)**:
   - **Sentralisasi Kunci API (`/settings/keys`)**: Memindahkan seluruh API key dari user profile ke BYOK Hub terpadu (OpenRouter AI, Web Search Tavily/Brave/SearxNG, Pexafy).
   - **Penyedia Gambar Baru**: Mengeliminasi Pexels dan Unsplash; mengintegrasikan SearxNG (Web & Images) dan API Key Pexafy (`https://api.pexafy.com/api/v1/search/photos`).
   - **Konsolidasi Sidebar Navigasi**: Menggabungkan Link Building, Author Creator, dan Kategori Creator menjadi satu item menu **"WP Tools"** (`/tools`), dengan hub kartu di `/tools`.
9. **ADR-050 (AI-Native WP Tools: Retroactive Link Building, Author Persona E-E-A-T, & Category Taxonomy Designer)**:
   - Mengubah seluruh tools dari sekadar generator/penyimpan statik menjadi asisten bertenaga AI yang menginspeksi WordPress target via REST API.
   - **Link Building (`/tools/link-building`)**: Input URL artikel baru -> AI ekstraksi topik & kueri pencarian WP -> scan konten artikel lama -> rekomendasikan kalimat penyisipan tautan & anchor natural -> aksi salin atau sisipkan langsung ke WordPress via REST API.
   - **Author Creator (`/tools/authors`)**: Input instruksi persona -> AI periksa author & bio lama di WP -> rancang 2-3 persona E-E-A-T -> alur persetujuan (Setujui & Buat di WP / Tolak).
   - **Category Creator (`/tools/categories`)**: Input instruksi topik -> AI baca kategori WP aktif -> rancang 3-6 kategori non-overlapping dengan deskripsi SEO -> pilih & terbitkan masal ke WP.
   - Compact Site Selector diintegrasikan langsung ke `PageHeader.actions` untuk menghemat ruang vertikal.
10. **ADR-051 (Perbaikan Pipeline Writer: Eliminasi Infinite Loop gpt-oss-120b & Markdown-First Architecture)**:
    - **Penggantian Model Default**: Mengganti `openai/gpt-oss-120b` (yang mengalami bug infinite loop spasi pada OpenRouter) ke `meta-llama/llama-3.3-70b-instruct` (stabil, cepat, hemat).
    - **Dual-Mode Article Parser (Markdown-First & JSON)**: Memperkaya parser naskah untuk mengekstrak Title, Excerpt, dan Markdown Body baik dari format JSON terstruktur maupun format Markdown bertag `TITLE:`/`EXCERPT:`/`---`.
    - **Relaksasi Validasi `site`**: Mengubah validasi UUID kaku pada `site.siteId` menjadi opsional agar pengujian cepat di Laboratorium (`/lab`) dan standalone worker tidak terblokir `INVALID_INPUT`.
11. **ADR-052 (Pre-Writing Taxonomy & Author Resolver + Hidden Global Formatting/Repair Engine)**:
    - **Pre-Resolution Engine (`pre-resolve.ts`)**: Sebelum agent mulai menulis, sistem di latar belakang memverifikasi author, kategori, dan tag dari target WordPress. Menyuntikkan persona author (nama & bio) ke user prompt, serta mengunci `author.id` yang sah agar publikasi WP REST API tidak pernah ditolak (`Invalid author ID`).
    - **Hidden Global Formatting & Repair Engine**: Mekanisme pembersihan & perbaikan format sepenuhnya tersembunyi dari user (user fokus murni ke pembuatan prompt agen). Menghilangkan preamble/outro percakapan AI, menghapus duplikasi judul H1 di awal body, menurunkan H1 di dalam body menjadi H2, membersihkan frasa klise/slop, dan mengonversi otomatis ke Native WordPress Gutenberg Blocks (`<!-- wp:... -->`).
    - **Endpoint `/api/sites/[id]/authors`**: Menyediakan REST route GET & POST untuk verifikasi dan pendaftaran author WordPress secara langsung.
12. **ADR-053 (Pengelompokan Artikel Tulis Cepat ke Grup Antrean & Eliminasi Batch Kosong)**:
    - **Tulis Cepat Terdaftar di Antrean**: Menghilangkan filter `onlyBatches=true` di `/queue/items`. Artikel standalone dari Tulis Cepat (`batch_id: null`) sekarang dikelompokkan otomatis ke dalam batch virtual `"Tulis Cepat (Quick Writer)"` (`id: "quick-writer"`).
    - **Eliminasi Batch Kosong**: Di halaman Antrean (`/queue/items`), sistem hanya menampilkan kartu batch yang memiliki minimal 1 artikel (`items.length > 0`). Batch kosong tanpa artikel tidak lagi memunculkan kartu nama kosong.
    - **Filter Batch Tidak Kosong**: Dropdown filter batch hanya menampilkan opsi batch yang memiliki artikel, termasuk opsi `"⚡ Tulis Cepat (Quick Writer)"`, sehingga ketika diklik tidak pernah menghasilkan tampilan kosong.
13. **ADR-054 (LLM Pre-Flight Taxonomy & Author Resolver, Prefix `system-*` Prompts, `set_featured_image` Tool, & Deduplikasi Media)**:
    - **Eksternalisasi Prompt & Konvensi Prefix `system-*`**: Seluruh prompt disimpan di `src/core/shared/prompts/` tanpa ada prompt hardcode di TypeScript. Semua prompt non-user wajib memakai prefix `system-*` (`system-guardrail.md`, `system-finalize.md`, `system-resolve-taxonomy-author.md`, `system-tool-*.md`).
    - **LLM-Based Pre-Flight Resolver (`pre-resolve.ts`)**: Resolusi taksonomi (kategori, tag) dan penulis menggunakan LLM dengan template `system-resolve-taxonomy-author.md`. Menganalisis data author, kategori, dan tag dari WP target sebelum agen menulis, dengan fallback heuristik cerdas jika tanpa API key atau saat error jaringan.
    - **Tool `set_featured_image`**: Tool bagi agent/pipeline untuk mencari gambar sampul landscape web relevan dan menyetel `recorder.featuredImage` secara otomatis.
    - **Tabel Deduplikasi Media (`uploaded_media`)**: Skema tabel Supabase mencatat `site_id`, `source_url`, `image_id`, dan metadata. Pipeline `uploadMediaToWordPress` memeriksa tabel ini agar gambar yang sama tidak diunggah ulang ke WordPress Media Library.
14. **ADR-055 (Standardisasi Format Prompt: Prefix `wp-tools-`, Metadata YAML, & Tag `[SYSTEM_PROMPT]` / `[USER_PROMPT]`)**:
    - **Prefix `wp-tools-` untuk WP Tools**: Seluruh prompt terkait WP Tools (`categories-suggest`, `authors-suggest`, `link-extract`, `link-recommend`) menggunakan prefix `wp-tools-` (`src/core/shared/prompts/wp-tools-*.md`), bukan `system-`.
    - **Metadata YAML Frontmatter**: Setiap berkas prompt wajib memiliki blok YAML di bagian atas berisi `used-by`, `description`, dan `variables`.
    - **Tagging Format Prompt**: Konten prompt dibungkus secara terstruktur menggunakan tag `[SYSTEM_PROMPT]...[/SYSTEM_PROMPT]` dan `[USER_PROMPT]...[/USER_PROMPT]`.
    - **Prompt Loader Berbasis Tag (`loader.ts`)**: Loader mengekstrak metadata YAML, mendeteksi tag pembungkus, dan mendukung pemanggilan dwiarah `loadPrompt`, `loadSectionedPrompt`, serta `loadParsedPrompt`.
15. **ADR-056 (Injeksi Konteks Website & Persona ke Workflow Prompt Agen + Fleksibel Output Schema)**:
    - **Injeksi Variabel Dinamis ke Workflow Prompt Agen (`preset-*.md`)**: `buildSystemPrompt` di `prompt-builder.ts` kini menerima `SystemPromptVariables` (`siteName`, `siteUrl`, `authorName`, `authorBio`, `categoryName`, `language`). Agen AI kini menyadari nama website, brand, dan persona spesifik tempat artikel akan diterbitkan.
    - **Tag `[OUTPUT_FORMAT]` dengan Inferensi JSON Schema**: Mendukung notasi tanda tanya `?` pada nama key untuk mendeklarasikan field opsional/nullable secara ringkas dan manusiawi. Loader secara otomatis mengonversinya menjadi format JSON Schema standar (`strict: true`) yang dikirim ke `callOpenRouterJson` dengan fallback otomatis ke `json_object` jika model LLM tertentu belum mendukung `json_schema`.
16. **ADR-057 (Restrukturisasi Nomenklatur Prompt: 3 Pilar Utama `wp-tools-*`, `system-*`, dan `agent-*`)**:
    - **3 Pilar Prompt di `src/core/shared/prompts/`**:
      1. `wp-tools-*`: Kumpulan prompt khusus WP Tools (`wp-tools-categories-suggest.md`, `wp-tools-authors-suggest.md`, `wp-tools-link-extract.md`, `wp-tools-link-recommend.md`).
      2. `system-*`: Prompt fondasi inti infrastruktur runtime (`system-guardrail.md`, `system-finalize.md`, `system-resolve-taxonomy-author.md`).
      3. `agent-*`: Seluruh prompt yang mengatur perilaku dan input agent kepenulisan (`agent-user-prompt.md`, `agent-quick-writer.md`, `agent-research-writer.md`, `agent-deep-research.md`), menggantikan konvensi `preset-*` dan `user-prompt.md`.
    - **Standardisasi YAML Frontmatter**: Seluruh 11 prompt menggunakan skema `description`, `used_by` (array path), dan `variables` (array objek `{ key, desc }`).
    - **Backward-Compatible Prompt Resolution**: `loader.ts` otomatis memetakan alias nama lama (`preset-quick-writer`, `user-prompt`, dsb.) ke berkas `agent-*` yang baru sehingga aman dari pemanggilan legasi.
17. **ADR-058 (Eliminasi Tool Taksonomi Obsolete & Konsolidasi 6 Universal Tools Penulis)**:
    - **Pembersihan Tool Usang**: Mengeliminasi tool `list_wp_categories`, `list_wp_tags`, dan `list_wp_authors` dari `ToolRegistry` dan profil agen (`preset:research-writer` & `preset:deep-research`).
    - **Efisiensi Kuota Tool Calls & Token**: Penghapusan ini menjamin kuota `maxToolCalls` tidak terbuang untuk urusan administratif WordPress yang sudah selesai di tahap Pre-Flight Resolver (`pre-resolve.ts`).
    - **6 Universal Tools Aktif**: Agen kini fokus 100% pada riset dan kurasi visual (`keyword_suggestions`, `web_search`, `web_reader`, `image_search`, `set_featured_image`, dan `upload_media`).
18. **ADR-059 (Pembersihan Fosil Codebase)**: Eliminasi 6 modal/komponen usang (1.400+ baris), hapus interface engine lama, sentralisasi profil ke `builtin.ts`.
19. **ADR-060 (Aturan Anti-Admin Author Resolution & Prioritas Persona E-E-A-T)**:
    - Menambahkan aturan mutlak di prompt `system-resolve-taxonomy-author.md` dan filter `isTechnicalAdminUser` di `pre-resolve.ts`.
    - Sistem dan LLM dilarang memilih akun admin teknis (`admin`, `administrator`, `*_admin`, dll.) jika masih ada akun persona manusia lain di WordPress, meskipun bidang keahliannya lintas topik. Akun admin hanya dijadikan pilihan darurat jika situs benar-benar hanya memiliki 1 akun tunggal.

---


## 3. Technical Gotchas & Pelajaran Lapangan

- **Strict No-Autonomous Commit**: Agent TIDAK BOLEH mengeksekusi `git commit` tanpa instruksi/persetujuan eksplisit dari Pengguna.
- **Windows File Locking**: Di OS Windows, direktori kustomisasi yang sedang dipantau oleh *file watcher* IDE dapat terkunci (*EBUSY*). Jika folder kosong perlu dihapus, lakukan lewat file explorer IDE atau saat restart.
- **Strict No-Commit Secrets**: File `.env.local` atau dump kredensial situs WP nyata tidak boleh ter-track oleh Git.
- **User Communication Preference**: Bahasa Indonesia yang jelas, profesional, ringkas, tanpa basa-basi berlebihan (*no fluff*), tidak membuat asumsi sepihak, dan kode yang rapi sesuai konvensi.
- **Progress Tulis Cepat Masih Estimasi**: `/api/posts/quick` hanya membalas sekali di akhir proses, jadi tahap dijalankan timer internal (3.5s/9s/13s). Jangan mengklaim ini real-time; untuk itu perlu worker + Supabase Realtime (`execution_logs` sudah siap sebagai sumbernya).
- **`npm.cmd run lint` Kadang > 2 menit**: jalankan dengan timeout 300000ms, jangan diasumsikan gagal bila kelamaan.
- **Author Persona vs Byline**: Data author WordPress hanya dipakai sebagai referensi persona/sudut pandang. Byline `Penulis: ...` dilarang di prompt dan disanitasi otomatis oleh `markdown-cleaner.ts`.

---

## 4. Protokol Pembaruan Memori (Agent Maintenance Protocol)

Setiap Agent yang menyelesaikan pekerjaan atau mencatat kesepakatan baru **WAJIB**:
1. Menjaga ukuran file `MEMORY.md` ini tetap ramping (di bawah 100 baris).
2. Mendiskusikan dan menyepakati penentuan fase atau workflow berikutnya dengan Pengguna sebelum mencatatnya sebagai rencana tetap.
3. Menuliskan catatan teknis detail ke dalam file worklog di [`.agents/worklogs/`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/).
