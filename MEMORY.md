# MEMORY.md — Living Project Memory & State Index

Dokumen ini adalah **Memori Dinamis Proyek (Living Memory)** untuk seluruh AI Agent. Berbeda dengan [`AGENTS.md`](file:///d:/Antigravity/wp-autopost-dashboard/AGENTS.md) yang bersifat statik/kebijakan, file ini mencatat status terkini proyek, riwayat keputusan arsitektur (*ADR*), dan catatan teknis penting (*gotchas*) agar tidak terulang di sesi berikutnya.

---

## 1. Status Proyek Saat Ini

- **Tahap Selesai**: **MVP Minimal, Multi-Select Kategori WP, Resolusi Tag, BYOK Settings, Retry Sinkronisasi WP, Factory System Writer, Lab Pengujian (/lab), UI Tulis Cepat (/posts/new), Queue Worker, Standard Writing Engine, Hybrid Scraper Tools (Image & Web), Dynamic OpenRouter Models, Featured Image WP, Engine-Centric Prompts, User Prompt Modification UI (/prompts), Sanitasi Byline Penulis, dan Modul 2 Batch Keyword Ingestion & Smart Multi-Mode Scheduling (/queue)**.
- **Catatan Worklog**: [`00`-`19`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/) · [`20`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/20-author-byline-sanitization.md) · [`21`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/21-modul-2-batch-keyword-ingestion.md) *(terbaru)*
- **Fase Aktif**: **Modul 2 Selesai — Pemantauan Antrean & Queue Worker Drip-Feed Cron**.
- **Fase Berikutnya**: **Modul 3 Niche Auto-Genesis & Cron Queue Dispatcher Otomatis**.
- **Halaman yang Masih `ComingSoonView`**: `/settings` (sub-halaman profil & webhook menyusul).

---

## 2. Catatan Keputusan Arsitektur yang Telah Disepakati (ADR Summary)

1. **ADR-001 s/d ADR-010**: Fondasi awal Next.js root, WP REST zero-plugin, OpenRouter, cost-saver retry, sandbox `.workspaces/`, 3 modul ingesti, tri-mode image, drip-feed scheduler.
2. **ADR-011 s/d ADR-020**: WP authorize redirect callback, taksonomi dinamis, prompt versioning, table-only queue, 35 REST APIs, single-page Tulis Cepat, multi-select kategori, LangChain transisi.
3. **ADR-021 s/d ADR-025**: Konsolidasi baseline writer, extensible system writer, retry sinkronisasi WP, global TooltipProvider, konsolidasi BYOK settings.
4. **ADR-026 (Arsitektur Node AI & Prompt Templating `prompt.md`)**: Node AI memakai template `prompt.md` terpisah dengan YAML frontmatter & section tags yang dimuat via `loadNodePrompt()`.
5. **ADR-027 (Shared Factories `defineNode` & `defineEngine`)**: Fondasi orkestrasi LangGraph dipusatkan di `src/core/shared/factories/` bebas boilerplate dan stateless.
6. **ADR-028 (Laboratorium & Test Bench Modular `/lab`)**: Fasilitas test bench bottom-up (Tool ➔ Node ➔ Engine) di `/lab` untuk verifikasi independen tiap modul dengan output Raw JSON murni.
7. **ADR-029 (Standarisasi Halaman via `PageContainer` & `PageHeader`)**: Seluruh rute halaman memakai `PageHeader` seragam dan `PageContainer` dengan lebar konsisten (`max-w-7xl`).
8. **ADR-030 (Standard Writing Engine — Riset Topik & Kurasi Gambar)**: Menambahkan `StandardEngine` (`standard`) dengan pipeline LangGraph: `taxonomy_resolver` ➔ `topic_researcher` (search intent & LSI) ➔ `image_curator` (cover & in-content) ➔ `article_drafter` (anti-slop + cetak biru) ➔ `quality_checker` ➔ `gutenberg_formatter`.
9. **ADR-031 (Hybrid Image Search & Live Web Scraper with Anti-Bot & Selector)**: Menghubungkan tool `image_search` dan `web_search` ke live provider nyata: Bing HTML Scraper (gratis, tanpa API key), rotasi User-Agent, verifikasi aksesibilitas live & minWidth 1280px pada gambar, serta selektor provider opsional di UI Lab.
10. **ADR-032 (Anti-Decoy Honeypot Guard, Dynamic Env Resolver, & CirrusSearch Wikipedia)**: Mengatasi bot decoy Bing dengan Relevance Guard ketat, pemuatan dinamis API key dari `.env` (`getApiKey`), dan CirrusSearch Wikipedia full-text.
11. **ADR-033 (BYOK Search Providers Dashboard & Live Verification)**: Menyediakan antarmuka web BYOK di `/settings/search` untuk Tavily AI Search dan Brave Search API dengan live latency test dan `.env.local` hot-reload.
12. **ADR-034 (LangChain Agentic Topic Researcher with Token Budget)**: Mengubah Topic Researcher menjadi agen otonom bertenaga LangChain (`createReactAgent`) yang memanggil `web_search` dan `web_reader` (3-5 sumber), menyaring output ke fakta penting dan outline ringkas hemat token.
13. **ADR-035 (Dynamic OpenRouter Models Catalog & Centralized AI Settings)**: Menghilangkan dropdown pemilihan model AI dari seluruh form input data konten, memusatkannya secara global di `/settings/ai`, dan mengambil daftar 450+ model secara dinamis langsung dari endpoint OpenRouter (`https://openrouter.ai/api/v1/models`) dengan komponen picker interaktif (search, provider filter, context window).
14. **ADR-036 (WordPress Featured Image Publishing & Media Inspection)**: Menyambungkan hasil kurasi gambar dari `imageCuratorNode` ke postingan WordPress melalui `featured_media` pada WP REST API (`/wp-json/wp/v2/posts`), queue worker, serta visualisasi banner cover dan tab Media di antarmuka Lab Engine.
15. **ADR-037 (Engine-Centric Prompts Architecture & SaaS User Modification)**: Memusatkan dan memisahkan kumpulan prompt default ke skala Engine di `src/core/prompts/{engineId}-engine-prompts.md` (Quick Engine: 1-shot kreatif mandiri; Standard Engine: riset & kurasi gambar terikat ketat), dengan loader `engine-prompt-loader.ts` yang mendukung `mergeEnginePromptOverrides` untuk kustomisasi prompt di tingkat user/SaaS.
16. **ADR-038 (User Prompt Modification UI & DB Persistence)**: Implementasi halaman `/prompts` sebagai antarmuka kustomisasi prompt per-engine per-user. Arsitektur: API `GET /api/prompts` (baca default dari file .md + override Supabase), API `PUT/DELETE /api/prompts/[engineId]/[nodeId]` (upsert/hapus override), tabel `prompt_templates` (unique constraint user_id+template_id, RLS), tabel `prompt_template_versions` (audit trail), dan organism `PromptNodeEditor` (accordion dengan tab System/User Prompt, badge status override, tombol save & reset).
17. **ADR-039 (Integrasi Prompt Override ke Pipeline Generate Artikel)**: Helper `src/lib/prompts/fetch-user-overrides.ts` (query `prompt_templates` dengan filter `template_id LIKE 'engineId/%'`). `writer.ts run()` menerima parameter opsional `enginePrompts`. Queue Worker (`worker.ts`) fetch override sebelum `run()`, teruskan ke `engineContext.enginePrompts`. Fail-safe: query gagal → override kosong → generate tetap jalan dengan prompt default.
18. **ADR-040 (Modul 2 Batch Keyword Ingestion & Smart Multi-Mode Scheduling)**: Ingesti keyword masal berbasis list baris teks (1 baris = 1 keyword), counter dinamis & auto deduplikasi, 3 mode scheduling (`random` dengan rentang tanggal dan sebaran merata, `interval` jam kustom misal 32 jam sekali + jitter, dan `instant` publikasi hari ini), kalkulator `date-calculator.ts`, endpoint `POST/GET /api/batches`, endpoint `GET /api/queue`, komponen `ScheduleStrategyPicker`, `KeywordListForm`, `BatchListTable`, dan aktivasi rute `/queue` di sidebar navigation.
19. **ADR-041 (External VPS Worker Trigger Pathway & Constant-Time Security)**: Menyediakan jalur pemicu `/api/queue/process` untuk eksekusi antrean terjadwal dari luar (VPS Linux Crontab via `.workspaces/scripts/trigger-queue.sh` atau Windows PowerShell via `trigger-queue.ps1`). Mendukung autentikasi via `Authorization: Bearer <CRON_SECRET>`, header `x-cron-secret`, atau query `?secret=...` dengan validasi aman `crypto.timingSafeEqual`. Max duration diatur ke 60s untuk lingkungan serverless Next.js.
20. **ADR-042 (Atomic Claim Lock for Race-Condition-Free Queue Dispatch)**: Memasang mekanisme penguncian atomik langsung di database (`UPDATE post_items SET state='generating_content' WHERE id=item.id AND state='queued_input'`) pada `processNextPendingQueueItem` dan `processPostItem`. Menjamin tidak akan pernah ada artikel ganda (*double posting*), bahkan jika crontab atau webhook dipicu beruntun secara bersamaan dari VPS eksternal.
21. **ADR-043 (Non-Blocking Async Dispatch via Next.js `after()` & Direct Crontab Text Logging)**: Endpoint `/api/queue/process` mengklaim item secara atomik, lalu mendelegasikan eksekusi AI & WP ke latar belakang serverless menggunakan primitive resmi Next.js `after()`. Respons HTTP kembali seketika (< 200ms) tanpa memblokir cron VPS. Jika antrean kosong, mengembalikan respons kosong (0 byte) sehingga log VPS tidak terisi; jika ada item, mengembalikan 1 baris teks terstruktur `[tanggal] SUCCESS - Mulai memproses X artikel: "keyword1", "keyword2"` yang langsung di-append ke file log VPS tanpa butuh script bash perantara.

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
