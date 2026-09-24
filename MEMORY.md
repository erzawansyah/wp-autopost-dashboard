# MEMORY.md — Living Project Memory & State Index

Dokumen ini adalah **Memori Dinamis Proyek (Living Memory)** untuk seluruh AI Agent. Berbeda dengan [`AGENTS.md`](file:///d:/Antigravity/wp-autopost-dashboard/AGENTS.md) yang bersifat statik/kebijakan, file ini mencatat status terkini proyek, riwayat keputusan arsitektur (*ADR*), dan catatan teknis penting (*gotchas*) agar tidak terulang di sesi berikutnya.

---

## 1. Status Proyek Saat Ini

- **Tahap Selesai**: **Implementasi MVP Minimal, Multi-Select Kategori WP Nyata, Resolusi Tag Otomatis, Migrasi Engine Tulis Cepat ke `@langchain/openrouter` & `@langchain/core`, Tester Kunci AI, dan BYOK Settings**.
- **Catatan Worklog Lalu**: [`00-agent-setup.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/00-agent-setup.md), [`01-project-initialization.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/01-project-initialization.md), [`02-mvp-implementation.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/02-mvp-implementation.md), [`03-anti-slop-copywriting-revamp.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/03-anti-slop-copywriting-revamp.md), [`04-non-modal-and-ux-refinements.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/04-non-modal-and-ux-refinements.md), [`05-wp-categories-and-openrouter-agent.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/05-wp-categories-and-openrouter-agent.md), [`06-langchain-skills-and-packages-migration.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/06-langchain-skills-and-packages-migration.md)
- **Fase Aktif**: **Brainstorming & Desain Modular AI Article Generation Orchestrator (LangGraph Pipeline)**.
- **Fase Berikutnya**: **Implementasi Modular Orchestrator Pipeline, Background Queue Worker, & Bulk Ingestion**.

---

## 2. Catatan Keputusan Arsitektur yang Telah Disepakati (ADR Summary)

1. **ADR-001 (Root Installation dengan `src/`)**:
   - Next.js di-install di root workspace dengan opsi direktori `src/` demi kelancaran tooling Shadcn, Tailwind, dan Next.js App Router.
2. **ADR-002 (Zero-Plugin WP Onboarding)**:
   - Integrasi WordPress murni di atas REST API standar (`/wp-json/wp/v2/`) + Application Passwords bawaan. Dilarang mengharuskan pengguna memasang plugin custom di WordPress mereka.
3. **ADR-003 (OpenRouter-First + Pluggable BYOK)**:
   - OpenRouter menjadi gateway default sistem; arsitektur dibuat modular (`AIProviderAdapter`) agar pengguna dapat memasukkan API Key sendiri.
4. **ADR-004 (Cost-Saver State Machine Retry)**:
   - Status antrean memisahkan `failed_generation` (error AI) dan `failed_sync` (error WP). Retry koneksi WP langsung mengulang dari `ready_to_sync` tanpa memanggil ulang LLM.
5. **ADR-005 (Developer-Centric MCPs)**:
   - MCP Server di `.agents/mcp_config.json` dibatasi hanya untuk alat bantu developer (`supabase`, `next-devtools`, `fetch`). API aplikasi (DataForSEO & Pexels) diisolasi di level kode runtime.
6. **ADR-006 (Elevasi DESIGN.md, ARCHITECTURE.md, & PRD.md ke Root)**:
   - Mengikuti konvensi industri, dokumen acuan utama diletakkan di root repositori.
7. **ADR-007 (Sandbox Non-Aplikasi `.workspaces/`)**:
   - Isolasi berkas non-aplikasi ke `.workspaces/`: `scripts/` (reusable), `temp/` (scratch), dan `assets/` (mock fixtures).
8. **ADR-008 (3 Modul Ingesti Fleksibel)**:
   - Modul 1: Quick Single Post (1 artikel instan); Modul 2: Bulk CSV/List (antrean terjadwal); Modul 3: Niche Auto-Genesis (seed inisialisasi website baru).
9. **ADR-009 (Featured Image Tri-Mode Switcher)**:
   - Checkbox master on/off dengan 3 opsi sumber: Unsplash (gratis otomatis), Manual/URL, atau AI Image Generation.
10. **ADR-010 (Smart Humanized Drip-Feed Scheduler)**:
    - Penjadwalan bertahap berbasis jendela jam aktif dan pengacakan menit (*jitter*) untuk menghindari pola bot.
11. **ADR-011 (Redirect Callback Authorization WP - Selesai & Aktif)**:
    - Otorisasi WP via endpoint bawaan `authorize-application.php` dengan redirect callback (zero-credential copy-paste) + manual fallback. Dilengkapi state token HMAC anti-CSRF dan auto-encryption AES-256-GCM.
12. **ADR-012 (On-the-Fly Taxonomy Creation)**:
    - Kategori & tag WordPress dapat dipilih dari yang ada atau dibuat baru secara langsung di semua skenario ingesti (Modul 1, 2, 3) via WP REST API.
13. **ADR-013 (Prompt Template Engine & Versioning)**:
    - Pengguna dapat mengkustomisasi prompt per flow (`quick_post`, `bulk_post`, `niche_ideation`, `anti_ai_filter`) dengan placeholder dinamis, riwayat versi otomatis, dan rollback.
14. **ADR-014 (Table-Only Queue View)**:
    - Tampilan antrean murni berbasis High-Performance Data Table (@tanstack/react-table + virtualisasi) tanpa opsi Kanban.
15. **ADR-015 (35 Modular Internal REST API Endpoints)**:
    - Arsitektur backend modular dengan 35 API routes di `/api/...` siap digunakan frontend maupun headless client.
16. **ADR-016 (Arsitektur Operasional Non-Modal & Persistensi Tema)**:
    - Menghilangkan modal pop-up untuk alur kerja operasional utama (Tulis Cepat dijadikan halaman workspace dedikasi `/posts/new`, formulir website dijadikan kartu inline). Sinkronisasi tema light/dark dijamin persisten via script inline anti-flicker di `<head>` dan `useSyncExternalStore`.
17. **ADR-017 (Multi-Select Kategori WP Nyata & Auto-Resolve Tag)**:
    - Kategori WordPress di form Tulis Cepat diambil langsung dari WP REST API (`/wp-json/wp/v2/categories`) dengan multi-select dropdown tanpa izin membuat kategori baru. Tag diinput dengan pemisah koma dan otomatis dicocokkan atau dibuatkan ID-nya di WordPress sebelum artikel terbit.
18. **ADR-018 (OpenRouter Agent SDK Engine & BYOK Management)**:
    - Mesin generasi AI diintegrasikan menggunakan resmi `@openrouter/agent` SDK (`client.callModel`) dengan dukungan multi-model (GPT-OSS, Claude 3.5, Gemini 2.5 Flash, DeepSeek), sanitasi API key, endpoint diagnostik `/api/ai/test`, dan halaman Pengaturan AI.
19. **ADR-019 (Transisi Engine Tulis Cepat & Skills ke LangChain `@langchain/openrouter`)**:
    - Menggantikan skill-skill OpenRouter lama dengan 22 skills resmi LangChain (`@langchain/core`, `@langchain/openrouter`, `@langchain/langgraph`). Engine Tulis Cepat (`src/lib/ai/generator.ts`) dimigrasikan ke `ChatOpenRouter` dengan Zod structured output & fallback JSON parsing. Dependensi lama `@openrouter/agent` dihapus bersih.

---

## 3. Technical Gotchas & Pelajaran Lapangan

- **Strict No-Autonomous Commit**: Agent TIDAK BOLEH mengeksekusi `git commit` tanpa instruksi/persetujuan eksplisit dari Pengguna.
- **Windows File Locking**: Di OS Windows, direktori kustomisasi yang sedang dipantau oleh *file watcher* IDE dapat terkunci (*EBUSY*). Jika folder kosong perlu dihapus, lakukan lewat file explorer IDE atau saat restart.
- **Strict No-Commit Secrets**: File `.env.local` atau dump kredensial situs WP nyata tidak boleh ter-track oleh Git.
- **User Communication Preference**: Bahasa Indonesia yang jelas, profesional, ringkas, tanpa basa-basi berlebihan (*no fluff*), tidak membuat asumsi sepihak, dan kode yang rapi sesuai konvensi.

---

## 4. Protokol Pembaruan Memori (Agent Maintenance Protocol)

Setiap Agent yang menyelesaikan pekerjaan atau mencatat kesepakatan baru **WAJIB**:
1. Menjaga ukuran file `MEMORY.md` ini tetap ramping (di bawah 100 baris).
2. Mendiskusikan dan menyepakati penentuan fase atau workflow berikutnya dengan Pengguna sebelum mencatatnya sebagai rencana tetap.
3. Menuliskan catatan teknis detail ke dalam file worklog di [`.agents/worklogs/`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/worklogs/).
