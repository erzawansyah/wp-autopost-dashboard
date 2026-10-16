# Panitera — WP Autopost & Multi-Site Content Dashboard

**Panitera** adalah dasbor SaaS multi-tenant untuk memproduksi, menjadwalkan, dan menerbitkan artikel ke banyak website WordPress. Artikel ditulis oleh **Agent Profile** (agen AI berbasis LangChain/Deep Agents) di antrean latar belakang, lalu dikirim lewat WordPress REST API + Application Passwords tanpa plugin apa pun di website pengguna.

Versi saat ini: `0.3.0` (branch `main`, tag `v0.3.0`; versi sebelumnya: tag `v0.2.0`, `v0.1.2`). Spesifikasi produk lengkap ada di [`PRD.md`](PRD.md); panduan pengguna ada di [`docs/guides/`](docs/guides/) (juga dibaca di aplikasi lewat menu **Help / Docs**).

---

## Fitur Utama

- **Koneksi WordPress tanpa plugin**: otorisasi Application Password satu klik (atau input manual), status koneksi per website yang diperbarui dari request nyata (**Cek ulang koneksi**, **Sambungkan ulang**), batas request paralel per website, kredensial terenkripsi AES-256-GCM.
- **Tiga cara menulis**: **Tulis Cepat** (satu artikel), **Tulis Massal** (daftar kata kunci, maks. 50 per batch), dan **Tulis Terstruktur** (CSV/TSV/tempel spreadsheet dengan kolom judul, LSI, fokus, tag).
- **Penjadwalan drip-feed**: eksekusi langsung atau bertahap, pola interval atau tanggal acak dengan variasi menit; artikel masa depan dikirim sebagai `future` ke WordPress.
- **Antrean 9-state berbasis database**: runner antrean tertanam dengan klaim atomik + lease, retry otomatis terbatas, kirim ulang hemat biaya tanpa LLM, anti-posting ganda, dan status live lewat Supabase Realtime privat (dengan polling cadangan).
- **Agent Profile Runtime**: mode Standard (`createAgent`) atau Deep (Deep Agents + `SKILL.md`), 6 Universal Tools riset/visual, Pre-Flight Resolver taksonomi & author, guard anti-loop, serializer Markdown → Gutenberg.
- **WP Tools**: Link Building retroaktif, Author Creator (persona E-E-A-T), dan Kategori Creator berbasis AI.
- **BYOK-only**: kunci OpenRouter, Tavily, Brave, Pexafy, dan LangSmith milik tiap pengguna disimpan terenkripsi di `/settings/keys`; tidak ada cadangan kunci platform kecuali `PLATFORM_KEY_ALLOWED=true`.
- **Laboratorium** (`/lab`, Developer Mode), **Skill Registry**, **webhook bertanda tangan HMAC**, dan **dokumentasi in-app** (`/docs`).

---

## Struktur Direktori

```text
wp-autopost-dashboard/
├── .claude/                # Harness Claude Code: rules, skills, hooks, settings
├── .github/                # Workflow CI & Dependabot
├── docs/
│   ├── guides/             # Panduan pengguna (reader in-app /docs, pola 0N-slug.md)
│   └── deploy/             # Panduan deploy & runbook upgrade
├── e2e/                    # Test end-to-end Playwright (global setup, fixture, blueprint WordPress)
├── evals/                  # Kasus & penilaian eval writer (npm run eval:writer)
├── public/                 # Aset statis (logo, favicon)
├── scripts/                # Audit kebersihan, build registry prompt, eval writer (lihat scripts/README.md)
├── searxng/                # Konfigurasi SearXNG internal
├── supabase/               # config.toml, migrations/, seed.sql, tests/ (PGlite)
├── src/
│   ├── app/                # Next.js App Router: (auth)/, (dashboard)/, api/
│   ├── components/         # Atomic Design: atoms, molecules, organisms, templates, providers
│   ├── core/               # Domain murni: queue/ (worker, retry), writer/ (Agent Profile Runtime), shared/ (LLM, tools, prompts, formatter)
│   ├── lib/                # Adapter: supabase, crypto, env, net (safeFetch), wordpress, ai, validation (zod), api client, hooks
│   ├── server/             # http/ (defineRoute, rate limit), services/, queue/ (runner tertanam)
│   ├── types/              # Tipe domain bersama
│   ├── instrumentation.ts  # Validasi env & start runner antrean
│   └── proxy.ts            # Penyegaran sesi & pengalihan login (pengganti middleware)
├── docker-compose.yml      # Aplikasi + SearXNG internal
├── Dockerfile              # Build standalone + HEALTHCHECK /api/health
└── package.json
```

---

## Quickstart Pengembangan

### 1. Prasyarat

- **Node.js 22** (dikunci di `.nvmrc`; `nvm use` bila memakai nvm).
- **Docker** untuk Supabase lokal (Supabase CLI sudah menjadi devDependency, dipanggil lewat `npx supabase`).

### 2. Instal dependensi

```bash
git clone https://github.com/erzawansyah/wp-autopost-dashboard.git
cd wp-autopost-dashboard
npm ci
```

### 3. Jalankan Supabase lokal

```bash
npx supabase start    # menerapkan supabase/migrations + seed.sql
npx supabase status   # menampilkan API URL, publishable key, dan secret key lokal
```

Alternatif: gunakan proyek Supabase cloud khusus dev, `npx supabase link --project-ref <ref>`, lalu `npm run db:push`. Jangan arahkan dev ke proyek production.

### 4. Konfigurasi `.env.local`

```bash
cp .env.example .env.local
```

Isi minimal (daftar lengkap & penjelasan ada di `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key dari supabase status>
SUPABASE_SECRET_KEY=<secret key dari supabase status>

# 64 karakter hex: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_MASTER_KEY=<isi sendiri>

# Proses antrean otomatis di dev (hanya dengan Supabase lokal/terisolasi)
QUEUE_RUNNER=embedded

# Opsional: izinkan WordPress lokal (mis. WordPress Playground di localhost)
# ALLOW_PRIVATE_NETWORK_FETCH=true
```

Kunci OpenRouter, mesin pencari, Pexafy, dan LangSmith **tidak** diisi di env: setiap pengguna menyimpannya di **Pengaturan → Pusat Kunci API & Model AI** (`/settings/keys`).

### 5. Jalankan aplikasi

```bash
npm run dev
```

Buka `http://localhost:3000`, daftar akun, simpan kunci OpenRouter, lalu sambungkan website WordPress.

Tanpa `QUEUE_RUNNER=embedded`, runner antrean di luar production default **off** (agar mesin dev yang memakai Supabase bersama tidak memproses item tenant lain); tombol **Jalankan sekarang** / **Tulis ulang** tetap memproses satu item milik Anda per klik. Setelah mengubah kode antrean (`src/core/queue`, `src/server/queue`), restart dev server karena runner tidak ikut hot reload.

---

## Skrip npm

| Perintah | Fungsi |
| :--- | :--- |
| `npm run dev` | Server pengembangan Next.js. |
| `npm run build` | Build produksi (`output: "standalone"`); `prebuild` menjalankan `prompts:build` otomatis. |
| `npm run start` | Menjalankan hasil build secara lokal (image Docker memakai `node server.js`). |
| `npm run typecheck` | `tsc --noEmit` (TypeScript strict). |
| `npm run lint` | ESLint; CI memakai `npm run lint -- --max-warnings=0`. |
| `npm test` / `npm run test:watch` | Vitest: `src/**/*.test.ts`, `supabase/tests/`, `scripts/`, `evals/`. |
| `npm run check` | Typecheck + lint + test sekaligus. |
| `npm run db:test` | Hanya test database (migrasi + RLS) dengan PGlite, tanpa Docker. |
| `npm run db:diff` / `npm run db:push` | Supabase CLI. `db:push` menerapkan migrasi ke proyek yang di-link; gunakan untuk dev/staging, atau production dengan persetujuan pemilik. |
| `npm run audit:hygiene` | Audit kebersihan: berkas yatim, prompt, istilah legacy, raw fetch, warna/ukuran arbitrer (`scripts/audit-allowlist.json` bersifat ratchet). |
| `npm run prompts:build` | Validasi `src/core/shared/prompts/*.md` dan tulis `registry.generated.ts`. |
| `npm run eval:writer` | Eval live kualitas writer atas `evals/cases/*.json` (memanggil LLM berbayar; `-- --dry-run` tanpa kunci). |
| `npm run test:e2e` | Playwright: Supabase lokal + WordPress Playground + `next dev`. |

Urutan verifikasi sebelum PR sama dengan CI: `typecheck` → `lint -- --max-warnings=0` → `test` → `audit:hygiene` → `build` (skill [`panitera-verify`](.claude/skills/panitera-verify/SKILL.md)). Tanpa `.env.local`, build bisa memakai placeholder:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy npm run build
```

Detail skrip & alur mengubah prompt: [`scripts/README.md`](scripts/README.md).

### Test End-to-End (Playwright)

`npm run test:e2e` menjalankan `e2e/tests/` terhadap layanan yang dinyalakan `e2e/global-setup.ts`:

1. **Supabase lokal** (dipakai ulang bila sudah berjalan; selain itu `supabase start`). Hentikan dengan `npx supabase stop`.
2. **WordPress Playground** (`@wp-playground/cli`, WordPress 7.1, PHP 8.3) dari `e2e/wordpress/blueprint.json`: admin + Application Password, tanpa plugin.
3. **Aplikasi** lewat `next dev` dengan runner tertanam dan `ENCRYPTION_MASTER_KEY` acak per run; `.env.local` tidak dipakai dan tidak ada panggilan LLM.

- **Prasyarat**: Docker berjalan; port `54321`–`54322`, `9400`, dan `3100` bebas; tidak ada `next dev` lain di checkout yang sama; `npx playwright install chromium` sekali.
- **Data**: setiap test memakai akun baru `@e2e.panitera.test` yang dihapus saat setup & teardown. Setup menolak berjalan bila Supabase lokal berisi antrean aktif akun lain (`E2E_ALLOW_SHARED_DB=1` untuk melewati).
- **Env opsional**: `E2E_OUTPUT_DIR`, `E2E_APP_PORT`, `E2E_WP_PORT`, `E2E_WP_VERSION`, `E2E_PHP_VERSION`, `E2E_KEEP_DATA=1`.
- **Hasil**: log layanan, trace/video test gagal, dan laporan HTML di `E2E_OUTPUT_DIR` (`npx playwright show-report <E2E_OUTPUT_DIR>/report`).

### Continuous Integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) berjalan pada setiap pull request dan push ke `main`/`v2`:

| Job | Isi |
| :--- | :--- |
| `checks` | `npm ci`, typecheck, lint (`--max-warnings=0`), Vitest (termasuk test DB PGlite), `audit:hygiene`, `npm audit --omit=dev --audit-level=critical`. |
| `build` | `next build` dengan env publik placeholder. |
| `docker` | `docker build` tanpa push. |
| `e2e` | `npm run test:e2e`; laporan & log diunggah sebagai artifact saat gagal. |

Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) membuka PR untuk npm, GitHub Actions, `Dockerfile`, dan image di `docker-compose.yml`.

### Server MCP untuk Claude Code

[`.mcp.json`](.mcp.json) mendaftarkan `supabase` (read-only; butuh `SUPABASE_ACCESS_TOKEN` dan `SUPABASE_PROJECT_REF` di environment shell, arahkan hanya ke proyek dev/staging), `next-devtools` (butuh `npm run dev` aktif), dan `playwright` (artefak di `.playwright-mcp/`, di-ignore Git).

---

## Deploy Produksi (Ringkas)

Target deploy utama adalah **Docker Compose di VPS**: container aplikasi Next.js (standalone, runner antrean tertanam, health check `GET /api/health`) dan **SearXNG** internal (`http://searxng-internal:8080`, tanpa port publik).

1. Terapkan migrasi Supabase ke proyek production lebih dulu (tinjau `npm run db:diff` sebelum `npm run db:push`), lalu deploy image baru.
2. Isi env production (Supabase, `ENCRYPTION_MASTER_KEY`, `NEXT_PUBLIC_APP_URL`, `SEARXNG_SECRET`; `CRON_SECRET` hanya bila `QUEUE_RUNNER=off`) di berkas `.env` root atau environment host, lalu `docker compose up -d --build`.
3. Matikan "Allow public access" di Supabase Dashboard → Realtime → Settings agar kanal Realtime privat ditegakkan.

Langkah lengkap, operasi harian, dan pemulihan: [`docs/deploy/docker-compose-vps.md`](docs/deploy/docker-compose-vps.md). Upgrade sekali jalan dari instalasi versi lama ke v2: [`docs/deploy/upgrade-ke-v2.md`](docs/deploy/upgrade-ke-v2.md).

---

## Dokumentasi Terkait

- Spesifikasi produk: [`PRD.md`](PRD.md)
- Arsitektur, skema DB, dan katalog API: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Sistem desain & token UI: [`DESIGN.md`](DESIGN.md)
- Status fase & ADR: [`MEMORY.md`](MEMORY.md)
- Panduan pengguna: [`docs/guides/`](docs/guides/)
- Pedoman agen AI di repo: [`CLAUDE.md`](CLAUDE.md) dan [`.claude/rules/`](.claude/rules/)
- Standar keamanan: [`.claude/rules/security.md`](.claude/rules/security.md)
