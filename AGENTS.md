# AGENTS.md — Panitera Workspace Rules & Master Context

Dokumen ini adalah **Sumber Kebenaran Utama (Primary Context & Workspace Rules)** untuk semua AI Agent (Antigravity, Subagents, dan CLI Agents) yang beroperasi di dalam repositori platform **Panitera (WP Autopost & Multi-Site Content Dashboard)**.

---

## 1. Visi & Peran Repositori (Hybrid: SaaS Dev + Agentic Ops)

Repositori ini dirancang dengan pendekatan **Hybrid**:

1. **SaaS Application Development**: Membangun platform web dasbor multi-situs modern (**Panitera**) di mana pengguna dapat menghubungkan banyak website WordPress mereka sendiri, membuat dan mengimpor konten secara masal (*bulk batch*), mengonfigurasi profil agen AI otonom, mengoptimalkan taksonomi dan tautan internal via WP Tools, serta mengatur jadwal penerbitan otomatis (*smart scheduling & humanized drip-feed*).
2. **Agentic Operations Hub**: Lingkungan kerja di mana AI Agent dapat langsung membantu riset kata kunci, mengeksekusi pengujian pipeline ke WordPress REST API, memverifikasi modul keahlian editorial (*SKILL.md*), hingga mengelola pengujian sandbox di Laboratorium (`/lab`).

---

## 2. Tech Stack & Fondasi Utama

- **Frontend & Fullstack**: **Next.js (App Router)** dengan **TypeScript** (`strict: true`).
- **Database & Autentikasi**: **PostgreSQL via Supabase** (Supabase Auth SSR untuk manajemen multi-tenant, Row Level Security / RLS wajib aktif di seluruh 9 tabel).
- **Integrasi WordPress**: **WordPress REST API (`/wp-json/wp/v2/...`) + Application Passwords** bawaan WordPress core.
  - *Prinsip Zero-Friction Onboarding*: **DILARANG** merancang fitur inti yang mengharuskan pengguna meng-install plugin custom atau mengedit kode PHP (`functions.php`) di sisi WordPress mereka saat pendaftaran. Semua koneksi dasar harus berjalan murni di atas WP REST API standar.
- **AI Provider & LLM Gateway**: **LangChain & LangGraph (Multi-Provider & BYOK-First)**
  - Menggunakan **`@langchain/openrouter`**, **`@langchain/core`**, dan **`@langchain/openai`** sebagai fondasi model agnostic (OpenRouter Llama 3.3 70B, Claude, GPT-4o, DeepSeek via BYOK).
  - Menggunakan arsitektur **Agent Profile Runtime** (`src/core/writer/`) yang mendukung Standard LangChain Agent (`createAgent`) dan Deep Agent otonom yang dapat membaca modul `SKILL.md`.
- **Media & Search Subsystem**:
  - **SearXNG Engine**: Metasearch engine mandiri berbasis container Docker (`docker-compose.yml`) di dalam jaringan internal (`http://searxng-internal:8080`) untuk Web Search dan Image Search tanpa kuota berbayar.
  - **Pexafy API**: Integrasi kurasi fotografi resolusi tinggi bebas royalti via API Pexafy.
  - **BYOK Search Provider**: Dukungan tambahan untuk Tavily, Brave Search, dan SerpAPI.
- **Styling & UI Components**: **Tailwind CSS v4 + Radix UI / Shadcn** dengan pendekatan **Atomic Design** (`atoms`, `molecules`, `organisms`, `templates`) yang dipandu oleh token desain di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md).

---

## 3. Prinsip Inti Sistem (Non-Negotiable Rules)

### A. Database-First State Machine (Single Source of Truth)

Setiap job pembuatan artikel maupun pengiriman ke WordPress—baik itu **Tulis Cepat**, **Immediate Batch**, maupun **Scheduled Drip**—**WAJIB disimpan dan dicatat statusnya di database Supabase terlebih dahulu** sebelum dieksekusi.

- Jangan pernah menjalankan *fire-and-forget* di memori tanpa jejak status di database.
- Pastikan setiap item antrean memiliki pelacakan status (`post_items.state`), `retry_count`, dan `wp_post_id` agar tidak terjadi duplikasi posting jika proses *retry* berjalan.
- Gunakan **Atomic Claim Lock** saat worker mengambil item antrean agar tidak terjadi tabrakan eksekusi worker paralel.

### B. Idempotency & Cost-Saver Retry

Kegagalan sinkronisasi WordPress (`failed_sync`) tidak boleh memicu pembuatan ulang konten AI (`generating_content`). Naskah yang sudah sukses dibuat dan tersimpan di database langsung di-retry ke langkah pengiriman WordPress (`syncing_to_wp`), sehingga kuota dan biaya token AI pengguna tidak terbuang sia-sia.

### C. Keamanan Multi-Tenant & WordPress Hosting Guard

- Kredensial **WordPress Application Password** dan API Keys pengguna **WAJIB dienkripsi dengan AES-256-GCM** sebelum disimpan ke database, dan hanya didekripsi di sisi server (*server-side only*).
- Semua request ke website WordPress pengguna harus menggunakan **Throttling / Concurrency Limit** per site (default: maks 2 request paralel per domain WP) agar tidak membebani *shared hosting* pengguna.
- Setiap koneksi keluar ke URL WordPress yang diinput pengguna wajib melewati validasi **Anti-SSRF** ketat (menolak IP privat RFC 1918 dan metadata cloud).

---

## 4. Protokol Operasional & Standar Perilaku Agent

Setiap Agent yang bekerja di repositori ini **WAJIB** mematuhi pedoman perilaku berikut:

1. **Pre-Implementation Cross-Check**:
   - Sebelum membuat atau memodifikasi skema database, API route, atau logika inti, baca [`ARCHITECTURE.md`](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md).
   - Sebelum mengubah alur bisnis atau spesifikasi modul, baca [`PRD.md`](file:///d:/Antigravity/wp-autopost-dashboard/PRD.md).
   - Sebelum membuat komponen UI atau halaman baru, baca token & pola layout di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md).
   - Untuk aspek keamanan, autentikasi, enkripsi, dan SSRF, patuhi [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md).
2. **Draft-First Testing pada Mode Ops**:
   - Saat menguji pipeline ke WordPress pengguna atau demo live, selalu default ke `status: 'draft'` kecuali jika pengguna secara eksplisit meminta pengujian `publish`.
3. **Zero Secret Leaks**:
   - Jangan pernah menuliskan secret nyata, token Supabase Service Role, API Key OpenRouter, atau password WordPress ke dalam file repositori yang ter-track oleh Git. Gunakan file lokal `.env.local` yang diabaikan oleh `.gitignore`.
4. **Type-Safety & Strict TypeScript**:
   - Semua kode TypeScript wajib memenuhi `strict: true`. Dilarang menggunakan `any` tanpa alasan teknis yang jelas dan terdokumentasi.
5. **No Autonomous Git Commits (Wajib Izin Pengguna)**:
   - DILARANG KERAS menjalankan perintah `git commit` atau push secara otomatis tanpa instruksi eksplisit atau persetujuan langsung dari pengguna. Setiap perubahan file harus tetap berada di staging/working tree sampai pengguna menginstruksikan commit.
6. **Sandbox Direktori `.workspaces/` (Zero Clutter Root)**:
   - Dilarang meletakkan script ad-hoc, pengujian API, dump sementara, atau mock media di root repository aplikasi. Semua berkas non-aplikasi WAJIB mengikuti taksonomi sandbox `.workspaces/`:
     - **`.workspaces/scripts/` (Reusable Scripts Only)**: Tempat menyimpan skrip otomasi/diagnostik yang dapat digunakan berulang kali. Setiap skrip wajib memiliki header dokumentasi lengkap.
     - **`.workspaces/temp/` (Disposable / Scratch Only)**: Tempat skrip sekali pakai yang **wajib dihapus setelah pengujian selesai**.
     - **`.workspaces/assets/` (Mock & Test Fixtures)**: Berkas statis untuk keperluan pengujian lokal (contoh CSV/Excel untuk uji parser batch).
7. **Atomic Design Thinking (Wajib Komponen Modular Dulu)**:
   - Dilarang membuat kode antarmuka monolitik di file halaman (`page.tsx`). Setiap kali merancang fitur UI, bedah dan bangun komponen modularnya terlebih dahulu (`atoms`, `molecules`, `organisms`, `templates`). File halaman hanya bertindak sebagai orkestrator data dan tata letak deklaratif. Patuhi [`.agents/rules/atomic-design-and-styling.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/atomic-design-and-styling.md).
8. **Modular Tailwind CSS (Strict Zero Arbitrary Hex)**:
   - DILARANG KERAS menggunakan arbitrary hex values (`text-[#881337]`, `bg-[#0F172A]`, dll.). Seluruh pewarnaan dan styling wajib menggunakan token semantik terdaftar (`bg-primary`, `text-muted-foreground`, `border-border`, dll.) yang telah ditetapkan di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md) dan [`src/app/globals.css`](file:///d:/Antigravity/wp-autopost-dashboard/src/app/globals.css).
9. **Standardisasi Struktur Halaman (`PageContainer` & `PageHeader`)**:
   - Seluruh halaman menu (`src/app/**/page.tsx`) WAJIB menggunakan `PageContainer` (`src/components/templates/page-container.tsx`) dengan lebar container yang seragam (`max-w-7xl mx-auto w-full`).
   - Header halaman WAJIB menggunakan `PageHeader` (`src/components/molecules/page-header.tsx`) dengan konsistensi atribut: `title`, `description`, `icon`, dan `actions` (tombol aksi utama di pojok kanan atas). Dilarang menyusun wrapper atau header arbitrer ad-hoc. Patuhi [`.agents/rules/page-layout-standard.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/page-layout-standard.md).
10. **Windows PowerShell Execution Standard (Anti-PSSecurityException)**:
    - Di sistem Windows, Agent WAJIB menyusun perintah shell menggunakan ekstensi `.cmd` secara eksplisit (`npx.cmd ...` dan `npm.cmd ...`) agar tidak terblokir oleh PowerShell script execution policy.
    - Dilindungi oleh lifecycle safety hook **`windows-command-normalizer`** di [`.agents/hooks.json`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/hooks.json). Patuhi [`.agents/rules/windows-shell-execution.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/windows-shell-execution.md).
11. **Standardisasi Komponen System Writer (Agent Profile Runtime & Gutenberg)**:
    - Seluruh pengembangan fitur pembuatan naskah wajib mengikuti arsitektur **Agent Profile Runtime** di `src/core/writer/`.
    - AI LLM diwajibkan menulis naskah dalam format **Markdown murni** terlebih dahulu, kemudian dikonversi deterministik ke **Native WordPress Gutenberg Blocks** (`<!-- wp:... -->`) sebelum dikirim ke WP REST API.
    - Dilindungi oleh **Anti-Infinite Loop Guards** (deduplikasi pemanggilan tool berturut-turut, circuit breaker setelah 2x gagal berturut-turut, hard limits, dan 1x emergency finalize call). Patuhi [`.agents/rules/writer-components-standard.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/writer-components-standard.md).
12. **Larangan Keras Hardcoding Prompt LLM (Externalize All Prompts to `src/core/shared/prompts/`)**:
    - DILARANG KERAS menulis teks prompt (baik System Prompt, User Prompt template, Finalize Prompt, maupun prompt untuk WP Tools / modul AI lainnya) langsung di dalam kode TypeScript (`.ts`/`.tsx`).
    - Seluruh prompt WAJIB disimpan dalam bentuk berkas terpisah (`.md`) di dalam direktori `src/core/shared/prompts/` dan dimuat menggunakan loader (`loadPrompt` / `loadSectionedPrompt` / `renderPrompt` dari `@/core/shared/prompts/loader`).
    - Hal ini mutlak agar pengguna memiliki kendali penuh untuk mengontrol, mengedit, dan mengaudit setiap prompt secara mandiri tanpa harus memodifikasi kode sumber aplikasi. Patuhi [`.agents/rules/prompt-management.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/prompt-management.md).

---

## 5. Peta Dokumentasi & Blueprint Workspace

| Dokumen / Folder | Lokasi | Cakupan & Fungsi |
| :--- | :--- | :--- |
| [`PRD.md`](file:///d:/Antigravity/wp-autopost-dashboard/PRD.md) | Root | Spesifikasi kebutuhan produk Panitera, 9 modul utama, 9-state queue, edge cases, dan NFR. |
| [`ARCHITECTURE.md`](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md) | Root | Cetak biru arsitektur sistem, 9 tabel Supabase, Agent Profile Runtime, dan katalog REST API. |
| [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md) | Root | Design system visual, tema Dark/Light, token warna semantik, dan pola UX Trello-Fluent. |
| [`MEMORY.md`](file:///d:/Antigravity/wp-autopost-dashboard/MEMORY.md) | Root | *Living Memory*, status fase aktif, ringkasan keputusan arsitektur (ADR-001 s/d ADR-053), dan gotchas. |
| [`docs/`](file:///d:/Antigravity/wp-autopost-dashboard/docs/) | `docs/` | Dokumentasi panduan pengguna interaktif (in-app reader di `/docs`). |
| [`.agents/rules/page-layout-standard.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/page-layout-standard.md) | `.agents/rules/` | Standar mutlak struktur halaman, PageHeader (title, desc, action), dan PageContainer. |
| [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md) | `.agents/rules/` | Standar keamanan SaaS Multi-Tenant, RLS Supabase, enkripsi AES-256-GCM, dan proteksi SSRF. |
| [`.agents/rules/atomic-design-and-styling.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/atomic-design-and-styling.md) | `.agents/rules/` | Pedoman Atomic Design dan larangan arbitrary hex code pada Tailwind CSS v4. |
| [`.agents/rules/skills-routing-matrix.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/skills-routing-matrix.md) | `.agents/rules/` | Matriks pemetaan jenis pekerjaan teknis ke skill AI wajib. |
| [`.agents/rules/windows-shell-execution.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/windows-shell-execution.md) | `.agents/rules/` | Standar eksekusi perintah shell Windows (`npx.cmd`/`npm.cmd`) pencegah `PSSecurityException`. |
| [`.agents/rules/writer-components-standard.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/writer-components-standard.md) | `.agents/rules/` | Standar Agent Profile Runtime, Universal Tools, loop guard, dan Gutenberg serializer. |
| [`.agents/rules/prompt-management.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/prompt-management.md) | `.agents/rules/` | Standar larangan hardcode prompt dan kewajiban externalize prompt ke `src/core/shared/prompts/`. |
| [`.agents/worklogs/`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/) | `.agents/worklogs/` | Catatan progres detail per milestone/fase untuk efisiensi context window. |
| [`.agents/hooks.json`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/hooks.json) | `.agents/` | Lifecycle safety hooks untuk proteksi kredensial dan normalisasi perintah shell Windows. |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
