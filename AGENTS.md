# AGENTS.md — WP Autopost & Multi-Site Content Dashboard

Dokumen ini adalah **Sumber Kebenaran Utama (Primary Context & Workspace Rules)** untuk semua AI Agent (Antigravity, Subagents, dan CLI Agents) yang beroperasi di dalam repositori `wp-autopost-dashboard`.

---

## 1. Visi & Peran Repositori (Hybrid: SaaS Dev + Agentic Ops)

Repositori ini dirancang dengan pendekatan **Hybrid**:

1. **SaaS Application Development**: Membangun platform web dashboard multi-user (multi-tenant) modern di mana pengguna dapat menghubungkan banyak website WordPress mereka sendiri, membuat/mengimpor konten secara masal (_batch_), dan mengatur jadwal penerbitan otomatis (_auto-posting & smart scheduling_).
2. **Agentic Operations Hub**: Lingkungan kerja di mana AI Agent dapat langsung membantu riset kata kunci (via MCP DataForSEO), menyusun dan mengaudit artikel ramah manusia (via skill seperti `anti-ai-editor`), mencari media gambar (Pexafy), hingga mengeksekusi pengujian pipeline ke WordPress REST API.

---

## 2. Tech Stack & Fondasi Utama

- **Frontend & Fullstack**: **Next.js (App Router)** dengan **TypeScript** (`strict: true`).
- **Database & Autentikasi**: **PostgreSQL via Supabase** (Supabase Auth untuk manajemen multi-tenant, Row Level Security / RLS wajib aktif di semua tabel).
- **Integrasi WordPress**: **WordPress REST API (`/wp-json/wp/v2/...`) + Application Passwords** bawaan WordPress.
  - _Prinsip Zero-Friction Onboarding_: **DILARANG** merancang fitur inti yang mengharuskan pengguna meng-install plugin custom atau mengedit kode PHP (`functions.php`) di sisi WordPress mereka saat pendaftaran. Semua koneksi dasar harus berjalan murni di atas WP REST API standar.
- **AI Provider & LLM Gateway**: **OpenRouter-First + Pluggable Multi-Provider (BYOK)**
  - Menggunakan **OpenRouter** sebagai gateway default aplikasi (akses ke model Claude, Gemini, GPT, DeepSeek via satu integrasi standar OpenAI-compatible).
  - Dirancang dengan pola `AIProviderAdapter` agar pengguna dapat memasukkan API Key / Provider mereka sendiri (_Bring Your Own Key / BYOK_).
- **Styling & UI Components**: **Tailwind CSS + Radix UI / Shadcn** dipandu oleh token desain di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md).

> **Prinsip Fleksibilitas (Living Blueprint)**:
> Semua spesifikasi skema, UI, dan integrasi bersifat **modular dan adaptif (tidak kaku)**. Setiap kali masuk ke tahap pembuatan fitur baru, Agent wajib menggunakan pola _Adapter/Interface_ agar penambahan provider AI, sumber konten, atau mekanisme antrean baru tidak pernah merombak kode inti.

---

## 3. Prinsip Inti Sistem (Non-Negotiable Rules)

### A. Database-First State Machine (Single Source of Truth)

Setiap job pembuatan artikel maupun pengiriman ke WordPress—baik itu **Immediate Batch** (proses langsung) maupun **Scheduled/Cron** (tayang bertahap)—**WAJIB disimpan dan dicatat statusnya di database Supabase terlebih dahulu** sebelum dieksekusi.

- Jangan pernah menjalankan _fire-and-forget_ di memori tanpa jejak status di database.
- Pastikan setiap item batch memiliki pelacakan status (`post_items.state`), `retry_count`, dan `wp_post_id` agar tidak terjadi duplikasi posting jika proses _retry_ berjalan.

### B. Pluggable Content Ingestion (Multi-Source)

Arsitektur input konten harus berbasis modul `ContentSourceAdapter`:

1. **CSV / Bulk Keyword Upload**: Pengguna mengunggah file CSV/Excel dengan _Column Mapping_.
2. **Niche Auto-Ideation**: Input nama _niche_ -> sistem meriset ide topik/keyword otomatis -> masuk antrean.
3. **External Sources**: Input dari URL referensi atau RSS feed.
4. **Extensibility**: Mudah ditambah adapter baru tanpa menyentuh modul queue.

### C. Keamanan Multi-Tenant & WordPress Hosting Guard

- Kredensial **WordPress Application Password** pengguna **WAJIB dienkripsi** (AES-256-GCM / Supabase Vault) sebelum disimpan ke database, dan hanya didekripsi di sisi server (_server-side only_).
- Semua request ke website WordPress pengguna harus menggunakan **Throttling / Concurrency Limit** per site (default: maks 2 request paralel per domain WP) agar tidak membebani _shared hosting_ pengguna.

---

## 4. Protokol Operasional & Standar Perilaku Agent

Setiap Agent yang bekerja di repositori ini **WAJIB** mematuhi pedoman perilaku berikut:

1. **Pre-Implementation Cross-Check**:
   - Sebelum membuat skema database, API route, atau logika inti, baca [`ARCHITECTURE.md`](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md).
   - Sebelum membuat komponen UI atau halaman baru, baca token & pola layout di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md).
   - Untuk aspek keamanan, autentikasi, enkripsi, dan SSRF, patuhi [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md).
2. **Draft-First Testing pada Mode Ops**:
   - Saat menguji pipeline ke WordPress pengguna atau demo live, selalu default ke `status: 'draft'` kecuali jika pengguna secara eksplisit meminta pengujian `publish`.
3. **Zero Secret Leaks**:
   - Jangan pernah menuliskan secret nyata, token Supabase Service Role, API Key OpenRouter, atau password WordPress ke dalam file repositori yang ter-track oleh Git. Gunakan file lokal `.env.local` yang diabaikan oleh `.gitignore`.
4. **Type-Safety & Linting**:
   - Semua kode TypeScript wajib memenuhi `strict: true`. Jangan gunakan `any` tanpa alasan teknis yang didokumentasikan.
5. **Idempotency & Safe Retry**:
   - Kegagalan sinkronisasi WordPress (`failed_sync`) tidak boleh memicu pembuatan ulang konten AI (`generating_content`). Konten yang sudah siap langsung di-retry ke langkah `syncing_to_wp`.
6. **No Autonomous Git Commits (Wajib Izin Pengguna)**:
   - DILARANG KERAS menjalankan perintah `git commit` atau push secara otomatis tanpa instruksi eksplisit atau persetujuan langsung dari pengguna. Setiap perubahan file harus tetap berada di staging/working tree sampai pengguna menginstruksikan commit.
7. **Sandbox Direktori `.workspaces/` (Zero Clutter Root)**:
   - Dilarang keras meletakkan script ad-hoc, pengujian API, berkas dump sementara, atau mock media di root repository aplikasi. Semua berkas non-aplikasi WAJIB mengikuti taksonomi sandbox `.workspaces/`:
     - **`.workspaces/scripts/` (Reusable Scripts Only)**: Tempat menyimpan skrip otomasi/diagnostik yang **dapat digunakan berulang kali** (misal: uji koneksi API, seed data, verifikasi token). Setiap skrip di folder ini **WAJIB** menyertakan panduan/header dokumentasi yang jelas (*tujuan, prasyarat `.env`, cara eksekusi, dan contoh output*) serta didaftarkan di [`.workspaces/scripts/README.md`](file:///d:/Antigravity/wp-autopost-dashboard/.workspaces/scripts/README.md).
     - **`.workspaces/temp/` (Disposable / Scratch Only)**: Tempat skrip sekali pakai yang **akan dihapus setelah pengujian selesai**, dump respons JSON mentah, atau log scratch sementara.
     - **`.workspaces/assets/` (Mock & Test Fixtures)**: Berkas statis untuk keperluan pengujian lokal (contoh CSV/Excel untuk uji parser batch, dummy image untuk uji upload WP media).

---

## 5. Peta Dokumentasi & Blueprint Workspace

| Dokumen / Folder                                                                                      | Lokasi            | Cakupan & Fungsi                                                                                                    |
| :---------------------------------------------------------------------------------------------------- | :---------------- | :------------------------------------------------------------------------------------------------------------------ |
| [`ARCHITECTURE.md`](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md)                     | Root              | Struktur folder repo, skema PostgreSQL Supabase, _State Machine_ Batch/Queue, dan kontrak WP REST API.              |
| [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md)                                 | Root              | _Design System_ (Google Stitch / `ui-ux-pro-max`), tema Dark/Light, token warna, tipografi, dan pola UX multi-site. |
| [`MEMORY.md`](file:///d:/Antigravity/wp-autopost-dashboard/MEMORY.md)                                 | Root              | _Living Memory_, status milestone aktif, keputusan arsitektur (ADR), gotchas, dan indeks worklog.                   |
| [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md) | `.agents/rules/`  | Standar keamanan SaaS Multi-Tenant, RLS Supabase, enkripsi Application Password, dan proteksi SSRF/XSS.             |
| [`.agents/mcp_config.json`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/mcp_config.json)     | `.agents/`        | Konfigurasi MCP Server developer (Supabase, Next-DevTools, Fetch).                                                  |
| [`.agents/skills/`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/skills/README.md)            | `.agents/skills/` | Direktori penyimpanan _Skills_ lokal maupun hasil instalasi dari registry `skills.sh`.                              |
| [`.agents/worklogs/`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/00-agent-setup.md) | `.agents/worklogs/`| Catatan progres detail per fase/milestone untuk menjaga efisiensi token context window.                             |
| [`.agents/hooks.json`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/hooks.json)               | `.agents/`        | Lifecycle safety hooks untuk mencegah kebocoran kredensial sebelum tool dijalankan.                                 |
