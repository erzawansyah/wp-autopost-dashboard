# CLAUDE.md — Panitera Project Context

Konteks utama untuk Claude Code di repositori **Panitera** (WP Autopost & Multi-Site Content Dashboard). Aturan rinci per area ada di [`.claude/rules/`](.claude/rules/) dan dimuat otomatis; aturan yang dibatasi `paths` aktif saat file terkait dibuka.

Komunikasi dengan pengguna: Bahasa Indonesia yang jelas, profesional, ringkas, tanpa asumsi sepihak.

---

## 1. Produk

SaaS dasbor multi-situs: pengguna menghubungkan banyak website WordPress, membuat & mengimpor konten massal (*bulk batch*), mengonfigurasi Agent Profile AI, mengoptimalkan taksonomi & tautan internal via WP Tools, dan menjadwalkan publikasi (*smart scheduling & humanized drip-feed*). Laboratorium pengujian ada di `/lab`.

## 2. Tech Stack

- **Next.js 16 (App Router) + TypeScript `strict: true`.** Versi ini punya perubahan besar dari data latih; baca panduan di `node_modules/next/dist/docs/` sebelum menulis kode Next.js (lihat blok di akhir file).
- **Supabase (PostgreSQL + Auth SSR)** — multi-tenant, RLS wajib di semua tabel.
- **WordPress REST API (`/wp-json/wp/v2/...`) + Application Passwords.** *Zero-Friction Onboarding*: dilarang merancang fitur inti yang mewajibkan pengguna memasang plugin custom atau mengedit PHP di WordPress mereka.
- **LangChain / LangGraph (BYOK-first)** — `langchain`, `@langchain/core`, `@langchain/langgraph`, `@langchain/openrouter`, `deepagents`, `langsmith` (tracer per tenant); Agent Profile Runtime di `src/core/writer/`.
- **Search & media** — SearXNG self-hosted (`docker-compose.yml`, `http://searxng-internal:8080`), Pexafy API, BYOK Tavily/Brave/SerpAPI.
- **UI** — Tailwind CSS v4 + Radix/shadcn, Atomic Design, token di `DESIGN.md` & `src/app/globals.css`.

## 3. Prinsip Inti (Non-Negotiable)

**A. Database-First State Machine.** Setiap job (Tulis Cepat, Immediate Batch, Scheduled Drip) wajib dicatat di Supabase *sebelum* dieksekusi. Tidak ada fire-and-forget di memori. Setiap item punya `post_items.state`, `retry_count`, `wp_post_id`. Worker mengambil item dengan **Atomic Claim Lock**.

**B. Idempotency & Cost-Saver Retry.** `failed_sync` di-retry langsung ke `syncing_to_wp` memakai naskah tersimpan — tidak pernah memicu `generating_content` ulang. Cek `wp_post_id` agar retry tidak menggandakan posting.

**C. Keamanan.** Kredensial WP & API key dienkripsi AES-256-GCM, didekripsi hanya di server; BYOK-only (tanpa fallback kunci platform kecuali `PLATFORM_KEY_ALLOWED=true`); throttling per situs (default maks 2 request paralel); setiap fetch ke URL dari pengguna/LLM lewat `safeFetch`. Rinci: [`.claude/rules/security.md`](.claude/rules/security.md).

## 4. Cara Kerja di Repo Ini

1. **Baca dulu sebelum mengubah:** `ARCHITECTURE.md` (skema DB, API route, logika inti), `PRD.md` (alur bisnis & spesifikasi modul), `DESIGN.md` (UI). Status fase & ADR terbaru: `MEMORY.md`.
2. **Draft-first.** Uji ke WordPress nyata selalu `status: "draft"` kecuali pengguna eksplisit meminta `publish`.
3. **Tanpa commit/push otomatis.** `git commit` dan `git push` hanya atas instruksi atau persetujuan eksplisit pengguna (`.claude/settings.json` meminta konfirmasi).
4. **Tanpa secret di repo.** Secret hanya di `.env.local`. Hook `guard-secrets` memblokir penulisan pola secret dan akses ke `.env*`.
5. **Komponen dulu, halaman belakangan** (Atomic Design), **zero arbitrary hex**, dan setiap halaman memakai `PageContainer` + `PageHeader`.
6. **Writer:** Agent Profile Runtime, Pre-Flight Resolver, 6 Universal Tools riset/visual, Markdown-first → Gutenberg, anti-loop guards.
7. **Prompt LLM tidak pernah di-hardcode** — selalu berkas `.md` di `src/core/shared/prompts/` (pilar `wp-tools-*`, `system-*`, `agent-*`).
8. **Zero dead code**, istilah konsisten **Agent Profile**, dan verifikasi sebelum menyatakan selesai:
   ```bash
   npm run typecheck
   npm run lint -- --max-warnings=0
   npm test               # Vitest: src/**/*.test.ts + test DB PGlite di supabase/tests
   npm run audit:hygiene  # orphan file, prompt hardcode, istilah legacy, raw fetch, warna arbitrer
   npm run build
   ```
   Urutan lengkap & penanganan kegagalan: skill `panitera-verify`. CI (`.github/workflows/ci.yml`) menjalankan hal yang sama.
9. **Sandbox lokal `.workspaces/`** (di-ignore Git) untuk skrip, scratch, fixture, dan worklog — jangan menaruh berkas ad-hoc di root.
10. **Pembaruan memori:** setelah menyelesaikan fase/keputusan besar, perbarui `MEMORY.md` (tetap < 100 baris) dan tulis detail di `.workspaces/worklogs/`. Fase berikutnya disepakati dengan pengguna dulu.

## 5. Peta Harness & Dokumentasi

| Lokasi | Fungsi |
| :--- | :--- |
| [`.claude/rules/security.md`](.claude/rules/security.md) | RLS, enkripsi kredensial, Anti-SSRF, zero secret leaks (selalu aktif). |
| [`.claude/rules/codebase-hygiene.md`](.claude/rules/codebase-hygiene.md) | Zero dead code, istilah, TS strict, verifikasi, sandbox `.workspaces/` (selalu aktif). |
| [`.claude/rules/skills-routing-matrix.md`](.claude/rules/skills-routing-matrix.md) | Skill mana yang dimuat untuk jenis pekerjaan apa (selalu aktif). |
| [`.claude/rules/atomic-design-and-styling.md`](.claude/rules/atomic-design-and-styling.md) | Atomic Design & token Tailwind (aktif di `src/components/**`, `src/app/**/*.tsx`). |
| [`.claude/rules/page-layout-standard.md`](.claude/rules/page-layout-standard.md) | `PageContainer` + `PageHeader` (aktif di `src/app/**/page.tsx`). |
| [`.claude/rules/writer-components-standard.md`](.claude/rules/writer-components-standard.md) | Agent Profile Runtime, tools, guards, queue (aktif di `src/core/writer/**`, queue, API writer). |
| [`.claude/rules/prompt-management.md`](.claude/rules/prompt-management.md) | 3 pilar prompt & format berkas (aktif di `src/core/**`, `src/lib/ai/**`, `src/app/api/**`). |
| [`.claude/skills/`](.claude/skills/) | Skill teknis pihak ketiga (Next/React, shadcn, Tailwind, TanStack Table, Supabase, LangChain/LangGraph/Deep Agents, WordPress) + skill proyek `panitera-*` (migrasi DB, verifikasi). |
| [`supabase/`](supabase/) | Migrasi skema + RLS, seed, dan test DB PGlite (`npm run db:test`). |
| [`.mcp.json`](.mcp.json) | MCP Supabase (read-only), Next DevTools, Playwright — lihat README. |
| [`.claude/settings.json`](.claude/settings.json) + [`.claude/hooks/`](.claude/hooks/) | Izin, pengaman secret, dan `npm ci` otomatis di sesi cloud. |
| [`PRD.md`](PRD.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`DESIGN.md`](DESIGN.md) · [`MEMORY.md`](MEMORY.md) | Produk, arsitektur, design system, memori & ADR. |
| [`docs/`](docs/) | Dokumen arsitektur internal; panduan pengguna (in-app reader `/docs`) di `docs/guides/`. |

Preferensi pribadi yang tidak perlu dibagikan ke tim: `CLAUDE.local.md` atau `.claude/settings.local.json` (keduanya di-ignore Git).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
