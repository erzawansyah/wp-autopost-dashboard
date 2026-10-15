# MEMORY.md — Living Project Memory & State Index

Dokumen ini adalah **Memori Dinamis Proyek (Living Memory)** untuk seluruh AI Agent. Berbeda dengan [`CLAUDE.md`](CLAUDE.md) dan [`.claude/rules/`](.claude/rules/) yang bersifat statik/kebijakan, file ini mencatat status terkini proyek, riwayat keputusan arsitektur (*ADR*), dan catatan teknis penting (*gotchas*) agar tidak terulang di sesi berikutnya.

---

## 1. Status Proyek Saat Ini

- **Tahap Selesai**: **MVP Minimal, Multi-Select Kategori WP, Resolusi Tag, BYOK Settings, Retry Sinkronisasi WP, Factory System Writer, Lab Pengujian (/lab), UI Tulis Cepat (/posts/new), Queue Worker, Standard Writing Engine, Hybrid Scraper Tools, Dynamic OpenRouter Models, Featured Image WP, Modul 2 Batch Keyword Ingestion, Agentic Writer Engine, Multi-Language Selection, Integrasi user_settings & webhooks, Perombakan Arsitektur Total ke Agent Profile Runtime, Modul Artikel Terjadwal (/scheduled), Skill Registry (/skills), Sentralisasi Kunci API (/settings/keys), Revamp Gambar (SearxNG + Pexafy), dan Konsolidasi Sidebar WP Tools (/tools)**.
- **Catatan Worklog**: `.workspaces/worklogs/` (lokal, di-ignore Git) — `00`–`28`, terbaru `28-rebranding-panitera-tools-config-and-docs.md`.
- **Fase Aktif**: **Rombak v2 (branch `v2`)** — Fase 0 (keamanan), Fase 1 (fondasi), Fase 2 (backend & runner antrean), Fase 3 (inti AI), Fase 4 (frontend) selesai; baseline migrasi masih rekonstruksi → wajib dicek `supabase db diff` ke production sebelum `db push`. Berikutnya (disepakati dulu): Fase 5 (dokumentasi & runbook deploy Docker Compose/VPS; webhook belum dipakai, tidak ada pengguna kunci platform). Roadmap: laporan audit 14 Okt 2026.
- **Fase Produk Berikutnya (setelah v2)**: **Modul 3 Niche Auto-Genesis & Smart Content Recycling**.

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
12. **ADR-053 (Grup Antrean Tulis Cepat)**: Artikel Tulis Cepat (`batch_id: null`) dikelompokkan ke batch virtual `quick-writer`; batch kosong disembunyikan dari daftar & filter.
13. **ADR-054 (LLM Pre-Flight Taxonomy & Author Resolver, Prefix `system-*` Prompts, `set_featured_image` Tool, & Deduplikasi Media)**:
    - **Eksternalisasi Prompt & Konvensi Prefix `system-*`**: Seluruh prompt disimpan di `src/core/shared/prompts/` tanpa ada prompt hardcode di TypeScript. Semua prompt non-user wajib memakai prefix `system-*` (`system-guardrail.md`, `system-finalize.md`, `system-resolve-taxonomy-author.md`, `system-tool-*.md`).
    - **LLM-Based Pre-Flight Resolver (`pre-resolve.ts`)**: Resolusi taksonomi (kategori, tag) dan penulis menggunakan LLM dengan template `system-resolve-taxonomy-author.md`. Menganalisis data author, kategori, dan tag dari WP target sebelum agen menulis, dengan fallback heuristik cerdas jika tanpa API key atau saat error jaringan.
    - **Tool `set_featured_image`**: Tool bagi agent/pipeline untuk mencari gambar sampul landscape web relevan dan menyetel `recorder.featuredImage` secara otomatis.
    - **Tabel Deduplikasi Media (`uploaded_media`)**: Skema tabel Supabase mencatat `site_id`, `source_url`, `image_id`, dan metadata. Pipeline `uploadMediaToWordPress` memeriksa tabel ini agar gambar yang sama tidak diunggah ulang ke WordPress Media Library.
14. **ADR-055 (Format Prompt)**: Prefix `wp-tools-*`, YAML frontmatter (`description`, `used_by`, `variables`), tag `[SYSTEM_PROMPT]`/`[USER_PROMPT]`, loader berbasis tag (`loadPrompt`, `loadSectionedPrompt`, `loadParsedPrompt`).
15. **ADR-056 (Injeksi Konteks Website & Persona ke Workflow Prompt Agen + Fleksibel Output Schema)**:
    - **Injeksi Variabel Dinamis ke Workflow Prompt Agen (`preset-*.md`)**: `buildSystemPrompt` di `prompt-builder.ts` kini menerima `SystemPromptVariables` (`siteName`, `siteUrl`, `authorName`, `authorBio`, `categoryName`, `language`). Agen AI kini menyadari nama website, brand, dan persona spesifik tempat artikel akan diterbitkan.
    - **Tag `[OUTPUT_FORMAT]` dengan Inferensi JSON Schema**: Mendukung notasi tanda tanya `?` pada nama key untuk mendeklarasikan field opsional/nullable secara ringkas dan manusiawi. Loader secara otomatis mengonversinya menjadi format JSON Schema standar (`strict: true`) yang dikirim lewat `completeJson` gateway LLM (`src/core/shared/llm/`) dengan fallback otomatis ke `json_object` jika model LLM tertentu belum mendukung `json_schema`.
16. **ADR-057 (3 Pilar Prompt)**: Semua prompt di `src/core/shared/prompts/` berprefix `wp-tools-*` (WP Tools), `system-*` (fondasi runtime), atau `agent-*` (perilaku & input agen) dengan frontmatter `description`/`used_by`/`variables`. Alias nama lama sudah dihapus (registry Fase 3 menuntut nama persis).
17. **ADR-058 (Eliminasi Tool Taksonomi Obsolete & Konsolidasi 6 Universal Tools Penulis)**:
    - **Pembersihan Tool Usang**: Mengeliminasi tool `list_wp_categories`, `list_wp_tags`, dan `list_wp_authors` dari `ToolRegistry` dan profil agen (`preset:research-writer` & `preset:deep-research`).
    - **Efisiensi Kuota Tool Calls & Token**: Penghapusan ini menjamin kuota `maxToolCalls` tidak terbuang untuk urusan administratif WordPress yang sudah selesai di tahap Pre-Flight Resolver (`pre-resolve.ts`).
    - **6 Universal Tools Aktif**: Agen kini fokus 100% pada riset dan kurasi visual (`keyword_suggestions`, `web_search`, `web_reader`, `image_search`, `set_featured_image`, dan `upload_media`).
18. **ADR-059 (Pembersihan Fosil Codebase)**: Eliminasi 6 modal/komponen usang (1.400+ baris), hapus interface engine lama, sentralisasi profil ke `builtin.ts`.
19. **ADR-060 (Aturan Anti-Admin Author Resolution & Prioritas Persona E-E-A-T)**:
    - Menambahkan aturan mutlak di prompt `system-resolve-taxonomy-author.md` dan filter `isTechnicalAdminUser` di `pre-resolve.ts`.
    - Sistem dan LLM dilarang memilih akun admin teknis (`admin`, `administrator`, `*_admin`, dll.) jika masih ada akun persona manusia lain di WordPress, meskipun bidang keahliannya lintas topik. Akun admin hanya dijadikan pilihan darurat jika situs benar-benar hanya memiliki 1 akun tunggal.
20. **ADR-061 (Rombak v2 · Fase 0: Hotfix Keamanan Multi-Tenant)**:
    - **BYOK-only**: kunci tenant hanya dari `user_settings` terenkripsi; tidak ada lagi baca/tulis `.env.local` saat runtime. Kunci platform hanya jika `PLATFORM_KEY_ALLOWED=true` (`src/lib/ai/platform-keys.ts`). LangSmith memakai tracer per tenant, tanpa mutasi `process.env`. API key tidak pernah disimpan di localStorage.
    - **Anti-SSRF terpusat**: semua fetch ke URL dari pengguna/LLM lewat `safeFetch` (`src/lib/net/safe-fetch.ts`: DNS pinning, blokir IP privat, validasi ulang redirect, batas ukuran). SearXNG platform hanya dipercaya untuk `/search` & `/autocompleter` (opt-in), `image_proxy` dimatikan. Dev lokal: `ALLOW_PRIVATE_NETWORK_FETCH=true`.
    - **Antrean**: klaim selalu difilter `user_id` untuk sesi; `CRON_SECRET` wajib & hanya lewat header; `syncing_to_wp` macet → `failed_sync`; item ber-`wp_post_id` tidak dipublikasi ulang; situs wajib milik pemilik item.
    - **Konten**: serializer Gutenberg escape penuh, tanpa passthrough HTML mentah, `[` dinetralkan (anti-shortcode); preview di dashboard disanitasi DOMPurify. Webhook ditandatangani `HMAC(secret, "timestamp.body")` + `X-Panitera-Timestamp`.
21. **ADR-062 (Rombak v2 · Fase 1: Fondasi)**: Skema di `supabase/migrations` (10 tabel, RLS force, GRANT eksplisit, FK komposit `(…, user_id)` anti lintas-tenant; `post_items` tanpa UPDATE oleh `authenticated`) + test PGlite `supabase/tests`. Env tervalidasi zod (`src/lib/env/*`, cek saat start via `instrumentation.ts`), `server-only` di modul kredensial. CI GitHub Actions + `npm run audit:hygiene` (allowlist ratchet). Lint wajib 0 warning. Worker hanya memakai Service Role.
22. **ADR-063 (Rombak v2 · Fase 2: Backend & Runner Antrean)**: Semua route lewat `defineRoute` (`src/server/http`: auth eksplisit, zod, `{ok,...}`/`{ok:false,error,code}`, pemetaan SQLSTATE, rate limit, body ≤ 1 MB default) + service layer `src/server/services`. Runner antrean tertanam (`src/server/queue`, start di `instrumentation.ts`) menggantikan `after()`/sidecar cron: RPC `claim_post_items` (lease + heartbeat, batas per situs, round-robin tenant), fencing token klaim unik (`locked_by`) + state persis, backoff 1→5 mnt maks 3 percobaan, timeout/5xx WP tidak dikirim ulang otomatis, `wp_post_id` tercatat → dituntaskan sukses; INSERT sesi hanya kolom input (GRANT per kolom). `QUEUE_RUNNER` default `embedded` hanya di production; `off` + `CRON_SECRET` = mode cron eksternal (1 item/pemicu). Panduan pengguna di `docs/guides/`.
23. **ADR-064 (Rombak v2 · Fase 3: Inti AI)**: Gateway LLM per run (`src/core/shared/llm`: BYOK-only, retry, fallback model `ai.fallbackModels`, ledger token & biaya), kontrak tool `ToolOutcome` + `AbortSignal` (guard membaca artifact), registry prompt ter-generate & berversi (`npm run prompts:build`, golden, `eval:writer`), checkpoint generasi `pre_resolve`/`draft` (`generation_checkpoints`, RPC berpagar token lease) untuk resume tanpa LLM, metrik biaya/versi di `agent_runs`, serializer Markdown→Gutenberg berbasis AST remark dengan pre-scan anti-DoS. Hasil review: error auth/kuota dibuka dari `MiddlewareError`, guard & anggaran model berlaku juga untuk subagent Deep mode, model `:free` tidak fallback ke berbayar, draft beracun dibuang hanya pada error deterministik.
24. **ADR-065 (Rombak v2 · Fase 4: Frontend)**: Route group `(auth)`/`(dashboard)` + `src/proxy.ts` (refresh sesi, `next` disanitasi, `/api` tak dialihkan); halaman RSC tipis + organism klien (TanStack Query via `apiFetch`, RHF + zod bersama `src/lib/validation`, `notify`/`useConfirm`); audit UI 0 palet mentah/`text-[Npx]`/`alert()`; Realtime antrean via Broadcast privat `user:<uid>:…` (bukan postgres_changes); header keamanan global; form rahasia `method=post` + tombol aktif setelah hydrate; e2e Playwright (`npm run test:e2e`: Supabase lokal + WordPress Playground, job CI `e2e`). Resep halaman: skill `panitera-page`.

---

## 3. Technical Gotchas & Pelajaran Lapangan

- **Strict No-Autonomous Commit**: Agent TIDAK BOLEH mengeksekusi `git commit` tanpa instruksi/persetujuan eksplisit dari Pengguna.
- **Windows File Locking**: Di OS Windows, direktori kustomisasi yang sedang dipantau oleh *file watcher* IDE dapat terkunci (*EBUSY*). Jika folder kosong perlu dihapus, lakukan lewat file explorer IDE atau saat restart.
- **Strict No-Commit Secrets**: File `.env.local` atau dump kredensial situs WP nyata tidak boleh ter-track oleh Git.
- **User Communication Preference**: Bahasa Indonesia yang jelas, profesional, ringkas, tanpa basa-basi berlebihan (*no fluff*), tidak membuat asumsi sepihak, dan kode yang rapi sesuai konvensi.
- **Runner Antrean & HMR**: di `npm run dev` runner tetap menjalankan kode lama setelah hot reload; restart dev server setelah mengubah `src/core/queue` / `src/server/queue`. Status antrean di UI berasal dari polling, belum Realtime.
- **`npm run lint` Kadang > 2 menit**: jalankan dengan timeout 300000ms, jangan diasumsikan gagal bila kelamaan.
- **Test**: `npm test` (Vitest, berkas `src/**/*.test.ts`). Jalankan bersama `npx tsc --noEmit` sebelum menyatakan selesai.
- **Author Persona vs Byline**: Data author WordPress hanya dipakai sebagai referensi persona/sudut pandang. Byline `Penulis: ...` dilarang di prompt dan disanitasi otomatis oleh `markdown-cleaner.ts`.

---

## 4. Protokol Pembaruan Memori (Agent Maintenance Protocol)

Setiap Agent yang menyelesaikan pekerjaan atau mencatat kesepakatan baru **WAJIB**:
1. Menjaga ukuran file `MEMORY.md` ini tetap ramping (di bawah 100 baris).
2. Mendiskusikan dan menyepakati penentuan fase atau workflow berikutnya dengan Pengguna sebelum mencatatnya sebagai rencana tetap.
3. Menuliskan catatan teknis detail ke dalam file worklog di `.workspaces/worklogs/` (lokal).
