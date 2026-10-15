# Panitera — WP Autopost & Multi-Site Content Dashboard

**Panitera** adalah platform manajemen, otomatisasi, dan orkestrasi konten multi-situs WordPress modern berbasis **AI Agent Profile Runtime**. Platform ini memungkinkan pemilik jaringan website (solopreneur, niche blogger, media portal, agensi SEO) untuk memproduksi artikel berkualitas tinggi secara masal, menyusun jadwal penerbitan bertahap (*smart humanized drip-feed*), memanfaatkan asisten AI untuk optimasi internal linking dan taksonomi, serta menerbitkan konten secara otomatis ke banyak website WordPress tanpa perlu memasang plugin khusus (*zero-plugin onboarding*).

---

## Fitur Utama

- 🌐 **Zero-Plugin WordPress Onboarding**:
  Terhubung langsung ke WordPress Anda murni melalui standar resmi **WordPress REST API** dan **Application Passwords**. Tanpa install plugin custom, tanpa edit file PHP (`functions.php`), dan tanpa risiko merusak website pengguna.
- 🤖 **Agent Profile Runtime & Studio (`/agents`)**:
  Kustomisasi agen penulisan AI secara otonom. Pilih antara **Standard LangChain Agent** (`createAgent`) atau **Deep Agent** yang membaca modul keahlian editorial (**`SKILL.md`** di `/skills`). Bebas mengatur persona, alur instruksi (*workflow prompt*), batasan eksekusi (*hard ceiling limits*), dan kombinasi alat (*universal tools*).
- ⚡ **Tulis Cepat (Quick Writer) (`/posts/new`)**:
  Buat dan terbitkan 1 artikel instan dalam hitungan menit dengan pemilihan situs, kategori, persona author, dan profil agen secara langsung.
- 📦 **Bulk Keyword Batch Ingestion (`/queue` & `/batches`)**:
  Unggah puluhan hingga ratusan kata kunci melalui berkas CSV/Excel atau teks masal dengan *Interactive Column Mapping*.
- 📅 **Smart Humanized Drip-Feed Scheduler (`/scheduled`)**:
  Jadwal tayang bertahap dengan algoritma *randomized minute jitter* dan jendela jam aktif agar pola publikasi artikel tampak alami di mata mesin pencari Google.
- 🛠️ **AI-Native WP Tools (`/tools`)**:
  - **Internal Link Building Retroaktif (`/tools/link-building`)**: Analisis artikel baru ➔ AI scan konten postingan lama via REST API ➔ AI rekomendasikan kalimat penyisipan internal link & anchor natural ➔ 1-klik terapkan ke WordPress.
  - **Pembuat Persona Penulis E-E-A-T (`/tools/authors`)**: AI rancang persona author kredibel dengan biografi persuasif ➔ otomatis daftarkan akun author baru ke WordPress.
  - **Perancang Taksonomi Kategori (`/tools/categories`)**: AI analisis kategori aktif untuk mencegah tumpang tindih topik ➔ rancang 3–6 kategori SEO ➔ terbitkan masal ke WordPress.
- 🧪 **Laboratorium Pengujian Agen (`/lab`)**:
  Sandbox uji coba terisolasi untuk menguji profil agen, model AI, dan tool sebelum digunakan pada antrean produksi.
- 🎨 **Markdown-First & Native Gutenberg Block Serializer**:
  AI menulis naskah dalam format Markdown murni (menghemat ~30% token dan anti-broken HTML), lalu dikonversi secara deterministik ke WordPress Gutenberg Blocks (`<!-- wp:... -->`) resmi.
- 🔍 **Pencarian Mandiri SearXNG & Kurasi Foto Pexafy**:
  Dukungan metasearch engine mandiri **SearXNG** (tanpa kuota berbayar) via Docker internal network, serta integrasi foto bebas royalti resolusi tinggi melalui **Pexafy API**.
- 🔑 **Unified Bring Your Own Key (BYOK) Hub (`/settings/keys`)**:
  Sentralisasi seluruh kunci API pihak ketiga (OpenRouter AI, Web Search: Tavily/Brave/SerpAPI, Pexafy API, dan SearXNG URL) dengan enkripsi aman **AES-256-GCM**.
- 🔔 **Outbound Webhooks (`/settings/webhooks`)**:
  Kirim notifikasi real-time bertanda tangan kriptografis HMAC SHA-256 ke Make, n8n, Zapier saat artikel sukses terbit, dijadwalkan, atau gagal.
- 📖 **Dokumentasi Pengguna Interaktif (`/docs`)**:
  Panduan lengkap cara pakai Panitera yang dapat dibaca langsung dari dalam antarmuka aplikasi.

---

## Struktur Direktori Proyek

```text
wp-autopost-dashboard/
├── .claude/                 # Harness Claude Code: rules, skills, hooks, settings
├── .github/                 # Workflow CI (GitHub Actions) & konfigurasi Dependabot
├── .workspaces/             # Sandbox lokal (di-ignore Git): scripts, temp, assets, worklogs
├── docs/                    # Berkas dokumentasi Markdown panduan pengguna (/docs)
├── scripts/                 # Skrip repo yang di-track (audit kebersihan codebase + allowlist)
├── searxng/                 # Konfigurasi mesin metasearch SearXNG
├── supabase/                # Migrasi SQL & test database (PGlite)
├── src/
│   ├── app/                 # Next.js App Router (Pages, UI, dan REST API)
│   ├── components/          # Komponen UI Atomic Design (atoms, molecules, organisms, templates)
│   ├── core/                # Logika bisnis murni (writer/, queue/, shared/)
│   ├── lib/                 # Adapter Supabase, crypto, AI, WordPress client, scheduler, webhooks
│   └── types/               # Tipe data TypeScript (settings, skills, webhooks)
├── .mcp.json                # Server MCP proyek untuk Claude Code (Supabase read-only, Next DevTools, Playwright)
├── docker-compose.yml       # Konfigurasi container Next.js (runner antrean tertanam) + SearXNG
├── Dockerfile               # Konfigurasi build Docker (standalone + HEALTHCHECK /api/health)
├── package.json             # Dependensi Next.js 16, LangChain, Supabase, Tailwind v4
└── tsconfig.json            # Konfigurasi TypeScript strict
```

---

## Panduan Memulai Cepat (Quickstart)

### 1. Prasyarat Sistem
- **Node.js 22** (versi dikunci di `.nvmrc`; jalankan `nvm use` bila memakai nvm).
- **Docker & Docker Compose** (Opsional, sangat direkomendasikan untuk menjalankan SearXNG mandiri).
- **Proyek Supabase**: URL, *publishable key*, dan *secret key* (atau *anon key* & *service role key* format lama).

### 2. Instalasi Dependensi
```bash
# Clone repository
git clone https://github.com/erzawansyah/wp-autopost-dashboard.git
cd wp-autopost-dashboard

# Install paket dependensi persis sesuai package-lock.json
npm ci
```

### 3. Konfigurasi Lingkungan (`.env.local`)
Salin berkas template lingkungan:
```bash
cp .env.example .env.local
```
Lengkapi variabel environment penting berikut:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# Kunci publik Supabase (nama lama NEXT_PUBLIC_SUPABASE_ANON_KEY tetap didukung)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
# Kunci server Supabase, hanya untuk worker/proses sistem (nama lama SUPABASE_SERVICE_ROLE_KEY tetap didukung)
SUPABASE_SECRET_KEY=your-supabase-secret-key

# Kunci Master Enkripsi AES-256-GCM (wajib, 32 byte hex / 64 karakter)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_MASTER_KEY=

# Runner antrean: di luar production default `off` agar mesin dev yang terhubung ke Supabase bersama
# tidak memproses item tenant lain. Aktifkan hanya dengan project Supabase dev/terisolasi:
# QUEUE_RUNNER=embedded
```

Daftar lengkap variabel ada di `.env.example`. Panitera bersifat BYOK: kunci OpenRouter, mesin pencari, Pexafy, dan LangSmith diisi tiap pengguna di `/settings/keys`, bukan di file environment.

### 4. Menjalankan Server Pengembangan Lokal
```bash
npm run dev
```
Buka browser di `http://localhost:3000`.

Di `npm run dev` antrean **tidak** diproses otomatis kecuali `QUEUE_RUNNER=embedded` disetel di `.env.local` (pakai project Supabase dev/terisolasi). Tanpa itu, tombol "Jalankan sekarang" tetap memproses satu item milik Anda per klik.

---

## Deployment Produksi via Docker Compose (Termasuk SearXNG)

Platform ini mendukung deployment satu perintah menggunakan Docker Compose dengan mesin metasearch mandiri (**SearXNG**) tanpa memerlukan kuota API berbayar:

```bash
# Jalankan container aplikasi Next.js + SearXNG di latar belakang
docker compose up -d --build
```

Docker Compose membaca variabel dari berkas `.env` di root proyek (bukan `.env.local`) atau dari environment shell/Portainer. Selain variabel Supabase dan `ENCRYPTION_MASTER_KEY`, `SEARXNG_SECRET` **wajib** diisi; tanpa nilai itu `docker compose` menolak berjalan. `CRON_SECRET` hanya wajib bila runner antrean dimatikan (`QUEUE_RUNNER=off`).

Setelah berjalan:
- **Panitera Dashboard**: `http://localhost:3000` (atau port publik host yang Anda tentukan). Status kesehatan container diperiksa lewat `GET /api/health`.
- **SearXNG**: Berjalan secara terisolasi di dalam Docker network internal (`http://searxng-internal:8080`) **tanpa membuka port ke publik luar**, menjamin keamanan dan mencegah konflik port di server Anda. Tag image dipin di `docker-compose.yml` dan diperbarui lewat Dependabot.
- **Runner antrean tertanam**: Proses Next.js menjalankan loop antrean sendiri (dimulai dari `src/instrumentation.ts`): klaim atomik per situs, lease + heartbeat, retry dengan backoff, dan pemulihan item macet. Tidak ada lagi sidecar `panitera-cron`; saat upgrade jalankan `docker compose up -d --remove-orphans` agar container lama ikut dihapus. Tuning lewat `QUEUE_CONCURRENCY`, `QUEUE_POLL_INTERVAL_MS`, `QUEUE_LEASE_SECONDS` (lihat `.env.example`). Untuk mode serverless/cron eksternal, set `QUEUE_RUNNER=off` dan panggil `POST /api/queue/process` berkala dengan header `Authorization: Bearer $CRON_SECRET` (setiap pemicu memproses maksimal 1 item; atur frekuensi cron sesuai volume).
- **Urutan upgrade**: terapkan migrasi Supabase lebih dulu (`npx supabase db push`), baru deploy image baru.

---

## Pengembangan

### Lingkungan & Perintah
- Node.js 22 (`.nvmrc`), instal dependensi dengan `npm ci`.
- Test database memakai PGlite (Postgres in-process), jadi tidak butuh Docker atau proyek Supabase.

| Perintah | Fungsi |
| :--- | :--- |
| `npm run dev` | Server pengembangan Next.js (`http://localhost:3000`). |
| `npm run check` | Typecheck + lint + test sekaligus. |
| `npm run typecheck` | `tsc --noEmit` (TypeScript strict). |
| `npm run lint` | ESLint; CI menjalankan `npm run lint -- --max-warnings=0`. |
| `npm test` / `npm run test:watch` | Vitest untuk `src/**/*.test.ts` dan `supabase/tests/`. |
| `npm run db:test` | Hanya test database (migrasi + RLS) di `supabase/tests/`. |
| `npm run db:diff` / `npm run db:push` | Supabase CLI. `db:push` menerapkan migrasi ke proyek yang di-*link*, jadi gunakan hanya untuk proyek dev/staging atau dengan persetujuan pemilik proyek. |
| `npm run audit:hygiene` | Audit kebersihan codebase (lihat di bawah). |
| `npm run build` | Build produksi (`output: "standalone"`). |
| `npm run test:e2e` | Test end-to-end Playwright: Supabase lokal + WordPress Playground + `next dev` (lihat di bawah). |

**Audit kebersihan** (`scripts/audit-codebase.ts`, langsung dijalankan Node 22 tanpa dependensi) memeriksa: berkas yatim dan modul yang hanya dipakai test, berkas prompt `.md` yang salah nama atau tidak dirujuk, prompt LLM hardcode di kode TS, istilah legacy "engine", warna mentah/arbitrary di UI, serta `fetch()` mentah ke URL non-relatif. Temuan lama yang disengaja dicatat di `scripts/audit-allowlist.json` dengan alasan dan batas `max` per berkas. Temuan baru membuat audit gagal. Host eksternal tetap (OpenRouter, Tavily, dll.) didaftarkan di `externalHosts`; URL dari pengguna/LLM wajib lewat `safeFetch()`.

Sebelum membuka PR, jalankan urutan yang sama dengan CI: `typecheck` → `lint -- --max-warnings=0` → `test` → `audit:hygiene` → `build` (lihat skill [`panitera-verify`](.claude/skills/panitera-verify/SKILL.md)). Tanpa `.env.local`, build bisa dijalankan dengan placeholder:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy npm run build
```

### Test End-to-End (Playwright)
`npm run test:e2e` menjalankan suite di `e2e/tests/` terhadap layanan lokal yang dinyalakan global setup (`e2e/global-setup.ts`) dan dimatikan lagi saat selesai:

1. **Supabase lokal** (Supabase CLI + Docker): dipakai ulang bila sudah berjalan (migrasi tertunda diterapkan dengan `supabase migration up --local`), selain itu `supabase start` (migrasi + seed). Stack dibiarkan berjalan setelah test; hentikan dengan `npx supabase stop`.
2. **WordPress Playground** (`@wp-playground/cli`, WordPress 7.1, PHP 8.3) dari blueprint `e2e/wordpress/blueprint.json`: admin + Application Password, tanpa plugin.
3. **Aplikasi** lewat `next dev` (bukan `next start`: build production sengaja menolak WordPress di loopback/http) dengan runner antrean tertanam, kunci demo Supabase lokal dari `supabase status`, dan `ENCRYPTION_MASTER_KEY` acak per run. `.env.local` tidak dipakai; tidak ada panggilan LLM atau layanan internet.

- **Prasyarat:** Docker berjalan; port `54321`–`54322` (Supabase), `9400` (WordPress), dan `3100` (aplikasi) bebas; tidak ada `next dev` lain di checkout yang sama (Next.js mengunci satu server dev per proyek). Browser: `npx playwright install chromium` sekali.
- **Data:** setiap test memakai akun baru `@e2e.panitera.test`; semua akun berdomain itu dihapus saat setup & teardown. Karena runner memproses antrean semua tenant, setup menolak berjalan bila Supabase lokal berisi antrean aktif milik akun lain (`E2E_ALLOW_SHARED_DB=1` untuk melewati).
- **Env opsional:** `E2E_OUTPUT_DIR` (default `<tmp>/panitera-e2e`), `E2E_APP_PORT`, `E2E_WP_PORT`, `E2E_WP_VERSION`, `E2E_PHP_VERSION`, `E2E_KEEP_DATA=1` (akun uji tidak dihapus).
- **Hasil:** log layanan (`logs/`), trace/video/screenshot test gagal (`test-results/`), dan laporan HTML (`report/`) di `E2E_OUTPUT_DIR` — buka dengan `npx playwright show-report <E2E_OUTPUT_DIR>/report`.

### Continuous Integration
Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) berjalan pada setiap pull request dan push ke `main`/`v2`. Run lama pada ref yang sama dibatalkan otomatis, dan token workflow hanya berizin `contents: read`.

| Job | Isi |
| :--- | :--- |
| `checks` | `npm ci`, typecheck, lint (`--max-warnings=0`), Vitest (termasuk test DB PGlite), `audit:hygiene`, dan `npm audit --omit=dev --audit-level=critical`. |
| `build` | `next build` dengan env publik placeholder (tanpa secret) dan cache `.next/cache`. |
| `docker` | `docker build` lewat Buildx dengan cache GitHub Actions, tanpa push. |
| `e2e` | `npm run test:e2e` (Supabase lokal via Docker, WordPress Playground, `next dev`); laporan Playwright + log layanan diunggah sebagai artifact saat gagal. |

Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)) membuka PR mingguan untuk npm (minor/patch digabung, major Next.js diabaikan) dan PR bulanan untuk GitHub Actions, `Dockerfile`, serta image di `docker-compose.yml`.

### Server MCP untuk Claude Code
[`.mcp.json`](.mcp.json) mendaftarkan tiga server MCP proyek. Claude Code meminta persetujuan saat server proyek pertama kali dipakai.

| Server | Kegunaan | Kebutuhan |
| :--- | :--- | :--- |
| `supabase` | Membaca skema, tabel, log, dan advisor Supabase dalam mode **read-only** (`--read-only`). | `SUPABASE_ACCESS_TOKEN` (Personal Access Token dari dashboard Supabase → Account → Access Tokens) dan `SUPABASE_PROJECT_REF`. |
| `next-devtools` | Diagnostik Next.js 16 (error, rute, log) dari server dev yang berjalan. | `npm run dev` aktif. |
| `playwright` | Mengendalikan browser untuk verifikasi UI. | Browser Playwright (unduh sekali bila diminta). Artefaknya di `.playwright-mcp/` (di-ignore Git). |

Variabel Supabase dibaca dari environment shell saat Claude Code dijalankan, bukan dari `.env.local`:

```bash
export SUPABASE_ACCESS_TOKEN=...   # token pribadi, jangan di-commit
export SUPABASE_PROJECT_REF=...    # ref proyek dev/staging
claude
```

Arahkan `SUPABASE_PROJECT_REF` hanya ke proyek **dev/staging**, jangan pernah ke produksi. Mode read-only mencegah penulisan, tetapi data pengguna produksi tetap tidak boleh dibaca agen. Tanpa kedua variabel ini, hanya server `supabase` yang gagal; server lain tetap berjalan.

---

## Dokumentasi Teknis Terkait

Untuk pemahaman mendalam mengenai arsitektur, siklus antrean, dan sistem desain:
- 📐 **Arsitektur Sistem & Database**: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- 📋 **Spesifikasi Kebutuhan Produk**: [`PRD.md`](PRD.md)
- 🎨 **Sistem Desain & Token Visual**: [`DESIGN.md`](DESIGN.md)
- 🤖 **Pedoman & Standar Perilaku AI Agent**: [`CLAUDE.md`](CLAUDE.md)
- 🔒 **Standar Keamanan & Proteksi Data**: [`.claude/rules/security.md`](.claude/rules/security.md)
