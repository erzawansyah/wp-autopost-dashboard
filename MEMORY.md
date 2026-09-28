# MEMORY.md — Living Project Memory & State Index

Dokumen ini adalah **Memori Dinamis Proyek (Living Memory)** untuk seluruh AI Agent. Berbeda dengan [`AGENTS.md`](file:///d:/Antigravity/wp-autopost-dashboard/AGENTS.md) yang bersifat statik/kebijakan, file ini mencatat status terkini proyek, riwayat keputusan arsitektur (*ADR*), dan catatan teknis penting (*gotchas*) agar tidak terulang di sesi berikutnya.

---

## 1. Status Proyek Saat Ini

- **Tahap Selesai**: **MVP Minimal, Multi-Select Kategori WP, Resolusi Tag, BYOK Settings, Retry Sinkronisasi WP, Factory System Writer, Lab Pengujian (/lab), UI Tulis Cepat (/posts/new), Queue Worker, Standard Writing Engine, dan Hybrid Scraper Tools (Image & Web)**.
- **Catatan Worklog**: [`00`-`14`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/) · [`15`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/15-standard-writing-engine-research-and-images.md) · [`16`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/16-hybrid-image-and-web-scraper.md) *(terbaru)*
- **Fase Aktif**: **Pengembangan Engine Penulisan Baru (Writing Engine Registry)**.
- **Fase Berikutnya**: **Modul 2 Bulk CSV/Keyword Ingestion & Smart Scheduling (Drip-feed)**.
- **Halaman yang Masih `ComingSoonView`**: `/queue`, `/prompts`, `/settings` (sub-halaman menyusul).

---

## 2. Catatan Keputusan Arsitektur yang Telah Disepakati (ADR Summary)

1. **ADR-001 s/d ADR-010**: Fondasi awal Next.js root, WP REST zero-plugin, OpenRouter, cost-saver retry, sandbox `.workspaces/`, 3 modul ingesti, tri-mode image, drip-feed scheduler.
2. **ADR-011 s/d ADR-020**: WP authorize redirect callback, taksonomi dinamis, prompt versioning, table-only queue, 35 REST APIs, single-page Tulis Cepat, multi-select kategori, LangChain transisi.
3. **ADR-021 s/d ADR-025**: Konsolidasi baseline writer, extensible system writer, retry sinkronisasi WP, global TooltipProvider, konsolidasi BYOK settings.
4. **ADR-026 (Arsitektur Node AI & Prompt Templating `prompt.md`)**: Node AI memakai template `prompt.md` terpisah dengan YAML frontmatter & section tags yang dimuat via `loadNodePrompt()`.
5. **ADR-027 (Shared Factories `defineNode` & `defineEngine`)**: Fondasi orkestrasi LangGraph dipusatkan di `src/core/shared/factories/` bebas boilerplate dan stateless.
6. **ADR-028 (Laboratorium & Test Bench Modular `/lab`)**: Fasilitas test bench bottom-up (Tool ➔ Node ➔ Engine) di `/lab` untuk verifikasi independen tiap modul dengan output Raw JSON murni.
7. **ADR-029 (Standarisasi Halaman via `PageContainer` & `PageHeader`)**: Seluruh rute halaman memakai `PageHeader` seragam dan `PageContainer` dengan lebar konsisten (`max-w-7xl`).
8. **ADR-030 (Standard Writing Engine — Riset Topik & Kurasi Gambar)**: Menambahkan `StandardEngine` (`standard`) dengan pipeline LangGraph: `taxonomy_resolver` ➔ `topic_researcher` (search intent & LSI) ➔ `article_drafter` (anti-slop + cetak biru) ➔ `image_curator` ➔ `quality_checker` ➔ `gutenberg_formatter`.
9. **ADR-031 (Hybrid Image Search & Live Web Scraper with Anti-Bot & Selector)**: Menghubungkan tool `image_search` dan `web_search` ke live provider nyata: Bing HTML Scraper (gratis, tanpa API key), rotasi User-Agent dan Client Hints acak anti-block, dekode instan URL redirect Bing, verifikasi aksesibilitas live & minWidth 1280px pada gambar, pembersihan entitas HTML, serta dropdown seleksi provider opsional di UI Lab.
10. **ADR-032 (Anti-Decoy Honeypot Guard, Dynamic Env Resolver, & CirrusSearch Wikipedia)**: Mengatasi perilaku Bing/Akamai Bot Manager yang menyajikan decoy/canned category SERP (konten trending acak atau tag umum seperti 'artis indonesia' saat mencari 'artis korea'). Menerapkan normalisasi kata kunci (`extractSearchKeywords`), Relevance & Anti-Decoy Guard ketat (`isResultsRelevant` >= 60% coverage), pemuatan dinamis API key dari `.env` (`getApiKey`) tanpa perlu restart dev server, upgrade Wikipedia ke CirrusSearch full-text (`list=search`), serta koneksi IPv4 deterministik pada `web-reader`.
11. **ADR-033 (BYOK Search Providers Dashboard & Live Verification)**: Menyediakan antarmuka web BYOK di `/settings/search` untuk Tavily AI Search (1.000 req/bln gratis) dan Brave Search API (2.000 req/bln gratis), tombol uji koneksi live latency (`/api/settings/search/test`), persistensi `.env.local` hot-reload (`/api/settings/search`), serta selektor preferensi provider default (`DEFAULT_SEARCH_PROVIDER`).
12. **ADR-034 (LangChain Agentic Topic Researcher with Token Budget & Read-Only Sources)**: Mengubah Node Topic Researcher menjadi agen otonom bertenaga LangChain (`createReactAgent`). Model secara mandiri memilih memanggil `web_search` untuk inisialisasi penelusuran topik, lalu memilih dan membaca 3-5 sumber web relevan menggunakan `web_reader`. Output terstruktur difilter ketat: `sources` HANYA menyertakan URL yang benar-benar dibaca via `web_reader`, `keyFindings` dibatasi 3-5 butir padat ringkas (maks 180 karakter/poin), `summaryExplanation` dipangkas ke 2-3 kalimat (maks 350 karakter), dan `outline` dipangkas ke 3-4 bab H2 untuk menghemat konsumsi token pada generasi naskah hilir (`article_drafter`).

---

## 3. Technical Gotchas & Pelajaran Lapangan

- **Strict No-Autonomous Commit**: Agent TIDAK BOLEH mengeksekusi `git commit` tanpa instruksi/persetujuan eksplisit dari Pengguna.
- **Windows File Locking**: Di OS Windows, direktori kustomisasi yang sedang dipantau oleh *file watcher* IDE dapat terkunci (*EBUSY*). Jika folder kosong perlu dihapus, lakukan lewat file explorer IDE atau saat restart.
- **Strict No-Commit Secrets**: File `.env.local` atau dump kredensial situs WP nyata tidak boleh ter-track oleh Git.
- **User Communication Preference**: Bahasa Indonesia yang jelas, profesional, ringkas, tanpa basa-basi berlebihan (*no fluff*), tidak membuat asumsi sepihak, dan kode yang rapi sesuai konvensi.
- **Progress Tulis Cepat Masih Estimasi**: `/api/posts/quick` hanya membalas sekali di akhir proses, jadi tahap dijalankan timer internal (3.5s/9s/13s). Jangan mengklaim ini real-time; untuk itu perlu worker + Supabase Realtime (`execution_logs` sudah siap sebagai sumbernya).
- **`npm.cmd run lint` Kadang > 2 menit**: jalankan dengan timeout 300000ms, jangan diasumsikan gagal bila kelamaan.

---

## 4. Protokol Pembaruan Memori (Agent Maintenance Protocol)

Setiap Agent yang menyelesaikan pekerjaan atau mencatat kesepakatan baru **WAJIB**:
1. Menjaga ukuran file `MEMORY.md` ini tetap ramping (di bawah 100 baris).
2. Mendiskusikan dan menyepakati penentuan fase atau workflow berikutnya dengan Pengguna sebelum mencatatnya sebagai rencana tetap.
3. Menuliskan catatan teknis detail ke dalam file worklog di [`.agents/worklogs/`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/).
