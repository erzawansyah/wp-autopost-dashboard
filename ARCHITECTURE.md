# ARCHITECTURE.md — Arsitektur Sistem & Cetak Biru Teknis Panitera

Dokumen ini adalah cetak biru teknis (*technical blueprint*) resmi untuk platform **Panitera (WP Autopost & Multi-Site AI Agentic Dashboard)**. Dokumen ini mendefinisikan arsitektur sistem, struktur modular Next.js App Router, skema PostgreSQL Supabase, siklus hidup antrean (*queue state machine*), *Agent Profile Runtime*, pipeline media/search, serta integrasi WordPress REST API.

---

## 1. Prinsip Desain Arsitektur

1. **Strict Core Separation (`src/core/`)**:
   Seluruh logika bisnis inti terisolasi penuh dari komponen UI React/Next.js:
   - `src/core/writer/`: Runtime eksekusi agen penulisan artikel (Agent Profile Runtime).
   - `src/core/queue/`: Worker pemrosesan antrean di latar belakang (*atomic claim lock*, fault-tolerant).
   - `src/core/shared/`: Universal tools, serialisasi Gutenberg Blocks, pembersih Markdown anti-slop, dan prompt preset.
2. **Agent Profile Runtime Hierarchy**:
   Menghilangkan ketergantungan pada pipeline/engine kaku. Arsitektur beroperasi atas hirarki modular:
   $$\text{Agent Profile} \longrightarrow \text{Universal Tools} \longrightarrow \text{Runtime Guards}$$
   Pengguna bebas mendefinisikan persona, model AI, alur instruksi (*workflow prompt*), batasan komputasi (*limits*), dan kombinasi alat yang dipilih mandiri.
3. **Database-First State Machine (Single Source of Truth)**:
   Tidak ada pekerjaan pembuatan artikel atau publikasi ke WordPress yang berjalan sebagai *fire-and-forget* di memori tanpa status yang tersimpan di PostgreSQL Supabase. Setiap tahap siklus hidup artikel dicatat, terlacak, dan dapat dilanjutkan secara *idempotent* jika terjadi interupsi.
4. **Zero-Plugin Onboarding & Hosting Guard**:
   Komunikasi dengan website WordPress pengguna berjalan murni di atas **WordPress REST API (`/wp-json/wp/v2/...`)** dan **Application Passwords** bawaan WordPress (tersedia sejak WP 5.6). Tidak memerlukan instalasi plugin custom atau perubahan PHP di sisi pengguna. Setiap koneksi dilindungi *per-site concurrency throttling* (default: maks 2 request paralel per domain).
5. **Markdown-First & Native Gutenberg Block Serializer**:
   AI LLM menulis naskah dalam format Markdown murni (menghemat konsumsi token prompt hingga ~30% dan mencegah risiko HTML rusak), lalu dikonversi secara deterministik ke WordPress Gutenberg Blocks (`<!-- wp:... -->`) sebelum dikirim ke WordPress REST API.
6. **Unified Bring Your Own Key (BYOK) Model**:
   Pengguna mengendalikan sendiri kuota dan biaya API mereka (OpenRouter AI, Web Search Tavily/Brave/SerpAPI, SearXNG lokal/mandiri, dan API Pexafy). Seluruh kredensial dienkripsi dengan **AES-256-GCM** sebelum disimpan ke database.

---

## 2. Struktur Direktori Repositori Aktual

```text
wp-autopost-dashboard/
├── .claude/                               # Harness Claude Code (lihat CLAUDE.md)
│   ├── rules/                             # Aturan operasional & keamanan (dimuat otomatis)
│   │   ├── security.md                    # Standar RLS Supabase, AES-256-GCM & anti-SSRF
│   │   ├── codebase-hygiene.md            # Zero dead code, TS strict, sandbox .workspaces/
│   │   ├── atomic-design-and-styling.md   # Pedoman Atomic Design & larangan arbitrary hex
│   │   ├── page-layout-standard.md        # Standar PageContainer & PageHeader seragam
│   │   ├── prompt-management.md           # 3 pilar prompt & format berkas
│   │   ├── skills-routing-matrix.md       # Matriks pemetaan tugas ke skill
│   │   └── writer-components-standard.md  # Standar Agent Profile Runtime & Gutenberg
│   ├── skills/                            # Skill teknis proyek (Next, Supabase, LangChain, WP)
│   ├── hooks/                             # Hook guard-secrets & session-start
│   └── settings.json                      # Izin & registrasi hooks
├── .workspaces/                           # Sandbox lokal (di-ignore Git): scripts, temp, assets, worklogs
├── CLAUDE.md                              # Konteks utama proyek untuk Claude Code
├── docs/                                  # Dokumen arsitektur internal (tidak disajikan ke pengguna)
│   └── guides/                            # Panduan pengguna untuk reader in-app /docs (satu-satunya yang disajikan)
│       ├── 01-memulai-panitera.md         # Panduan dasar dan konsep platform
│       ├── 02-koneksi-wordpress.md        # Zero-plugin onboarding & Application Passwords
│       ├── 03-manajemen-profil-agen.md    # Konsep Standard vs Deep Agent & Universal Tools
│       ├── 04-penerbitan-dan-penjadwalan.md # Tulis Cepat, Batch Ingestion & Smart Drip-Feed
│       └── 05-wp-tools-dan-utilitas.md    # Link Building, Author Persona, Category Designer
├── public/                                # Berkas statis web (favicon, ilustrasi)
├── searxng/                               # Konfigurasi mesin metasearch mandiri SearXNG
│   └── settings.yml                       # Konfigurasi engine & format JSON SearXNG
├── src/
│   ├── app/                               # Next.js App Router (Halaman UI & REST API)
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx             # Halaman autentikasi login (Supabase SSR)
│   │   │   └── register/page.tsx          # Halaman pendaftaran pengguna
│   │   ├── agents/                        # Agent Studio (Kelola Agent Profiles)
│   │   │   ├── page.tsx                   # Daftar profil agen & presets
│   │   │   ├── new/page.tsx               # Formulir perancangan agen baru
│   │   │   └── [id]/page.tsx              # Detail & konfigurasi profil agen
│   │   ├── batches/                       # Riwayat & pemantauan Batch Ingestion
│   │   │   └── page.tsx                   # Daftar batch campaign
│   │   ├── docs/                          # In-app Documentation Viewer
│   │   │   └── page.tsx                   # Pembaca berkas Markdown panduan pengguna
│   │   ├── lab/                           # Laboratorium Pengujian Agen
│   │   │   └── page.tsx                   # Sandbox pengujian profil agen terisolasi
│   │   ├── posts/                         # Manajemen Naskah Artikel
│   │   │   ├── page.tsx                   # Daftar seluruh artikel
│   │   │   ├── new/page.tsx               # Tulis Cepat (Quick Writer UI)
│   │   │   └── [id]/page.tsx              # Detail artikel, Gutenberg preview, & audit log
│   │   ├── queue/                         # Pusat Antrean Eksekusi
│   │   │   ├── page.tsx                   # Bulk Artikel (CSV Upload & Column Mapping Wizard)
│   │   │   └── items/page.tsx             # Tabel Antrean (Grouped by Batch, Atomic Actions)
│   │   ├── scheduled/                     # Artikel Terjadwal
│   │   │   └── page.tsx                   # Kalender & timeline artikel mode future
│   │   ├── settings/                      # Pusat Pengaturan Platform
│   │   │   ├── page.tsx                   # Index pengaturan
│   │   │   ├── keys/page.tsx              # Unified BYOK Hub (OpenRouter, Search, Pexafy)
│   │   │   ├── search/page.tsx            # Preferensi & konfigurasi provider pencarian
│   │   │   ├── ai/page.tsx                # Pengaturan global model AI
│   │   │   ├── webhooks/page.tsx          # Konfigurasi outbound webhook & event subscriptions
│   │   │   └── profile/page.tsx           # Profil pengguna & kata sandi
│   │   ├── sites/                         # Multi-Site WordPress Manager
│   │   │   └── page.tsx                   # Hubungkan situs, health check, edit taksonomi
│   │   ├── skills/                        # Skill Registry
│   │   │   ├── page.tsx                   # Daftar modul keahlian (SKILL.md)
│   │   │   └── new/page.tsx               # Buat modul keahlian editorial baru
│   │   ├── tools/                         # AI-Native WordPress Tools Hub
│   │   │   ├── page.tsx                   # Hub navigasi tools
│   │   │   ├── link-building/page.tsx     # Retroactive Internal Link Building
│   │   │   ├── authors/page.tsx           # Pembuat Persona Penulis E-E-A-T
│   │   │   └── categories/page.tsx        # Perancang Taksonomi Kategori
│   │   ├── api/                           # Endpoint Internal REST API
│   │   │   ├── agents/                    # CRUD profil agen, templates, tools
│   │   │   ├── ai/                        # Verifikasi kunci AI & dynamic model fetcher
│   │   │   ├── auth/                      # Session user & signout
│   │   │   ├── batches/                   # Inisialisasi & pembatalan batch
│   │   │   ├── docs/                      # Fetcher berkas Markdown dokumentasi
│   │   │   ├── health/                    # Healthcheck platform
│   │   │   ├── lab/                       # Registry runner untuk pengujian sandbox
│   │   │   ├── posts/                     # CRUD artikel & endpoint /api/posts/quick
│   │   │   ├── queue/                     # Pengambilan item antrean & /api/queue/process
│   │   │   ├── settings/                  # BYOK key updates, preferensi search
│   │   │   ├── sites/                     # CRUD situs, WP callback redirect, test auth
│   │   │   ├── skills/                    # CRUD modul keahlian agen
│   │   │   ├── tools/                     # Endpoint asisten link, author, kategori
│   │   │   └── webhooks/                  # CRUD webhook, pengujian trigger test
│   │   ├── layout.tsx                     # Root App Layout (Inter font, dark/light theme)
│   │   ├── page.tsx                       # Dashboard Overview (KPIs, Active Sites, Quick Links)
│   │   └── globals.css                    # Tailwind CSS v4 styling & semantic design tokens
│   ├── components/                        # Komponen UI Terstruktur (Atomic Design)
│   │   ├── atoms/                         # Badge, Button, Input, Select, Table, Card, Dialog
│   │   ├── molecules/                     # PageHeader, StatusBadge, SiteBadge, SearchInput
│   │   ├── organisms/                     # SidebarNav, TopNavbar, QueueDataTable, BatchListTable
│   │   └── templates/                     # DashboardLayout, PageContainer
│   ├── core/                              # Logika Bisnis Murni (Domain Slice Architecture)
│   │   ├── queue/                         # Background Queue Worker
│   │   │   └── worker.ts                  # Worker pemrosesan status, claim lock, & WP sync
│   │   ├── shared/                        # Utilitas & Tools Bersama
│   │   │   ├── formatters/                # Serializer Gutenberg Blocks & pembersih Markdown
│   │   │   ├── prompts/                   # File Markdown preset prompt bawaan
│   │   │   └── tools/                     # Implementasi Universal Tools (11 tools mandiri)
│   │   └── writer/                        # Agent Profile Runtime Engine
│   │       ├── presets/                   # Registrasi preset bawaan (quick, research, deep)
│   │       ├── runtime/                   # Eksekusi agen, loop-guard, telemetri, validator
│   │       ├── tools/                     # Registry, definisi, & eligibilitas tool
│   │       ├── types/                     # Contracts, schema input/output, profil agen
│   │       ├── writer.ts                  # Pintu masuk utama facade orchestrator: run()
│   │       └── index.ts                   # Public API barrel export (@/core/writer)
│   ├── lib/                               # Utilitas Bersama & Adapter Eksternal
│   │   ├── ai/                            # Klien OpenRouter, model list, verifikasi kunci
│   │   ├── constants/                     # Daftar bahasa, otoritas akses
│   │   ├── scheduler/                     # Kalkulator jadwal (randomized jitter & drip window)
│   │   ├── settings/                      # Dekripsi sentral kunci BYOK (user-keys.ts)
│   │   ├── supabase/                      # Klien Supabase (Browser, Server SSR, Admin Service)
│   │   ├── webhooks/                      # Dispatcher webhook dengan tanda tangan HMAC SHA-256
│   │   ├── wordpress/                     # Klien REST API WordPress & pembuat nama aplikasi
│   │   ├── crypto.ts                      # Enkripsi & dekripsi AES-256-GCM
│   │   └── utils.ts                       # Helper class merger Tailwind (`cn`)
│   └── types/                             # Definisi TypeScript Sistem
│       ├── settings.ts                    # Tipe data kunci BYOK, search, & notifikasi
│       ├── skills.ts                      # Tipe data modul keahlian agen
│       └── webhook.ts                     # Definisi event webhook & payload
├── docker-compose.yml                     # Orkestrasi Docker (Aplikasi Next.js + SearXNG)
├── Dockerfile                             # Konfigurasi build image kontainer produksi
├── package.json                           # Dependensi ekosistem Next.js 16, LangChain, Supabase
└── tsconfig.json                          # Konfigurasi TypeScript (strict: true)
```

---

## 3. Skema Inti Database (Supabase PostgreSQL)

Database menggunakan **PostgreSQL via Supabase** (wajib PostgreSQL ≥ 15). Seluruh **10 tabel** berada di skema `public`, setiap baris terikat ke pemilik lewat `user_id` → `auth.users(id)` (`ON DELETE CASCADE`), dan **Row Level Security (RLS) aktif + `FORCE`** di seluruh tabel. Sumber kebenaran skema adalah migrasi Supabase CLI di [`supabase/migrations/`](supabase/migrations/) — baseline `20261015090000_baseline_schema.sql` merekonstruksi skema yang dipakai kode (menggantikan skrip ad-hoc `.workspaces/scripts/migrate-*.js`). Tabel lama `prompt_templates` / `prompt_template_versions` tidak dipakai kode dan tidak termasuk baseline.

```mermaid
erDiagram
    users ||--o{ wp_sites : owns
    users ||--o| user_settings : configures
    users ||--o{ agent_profiles : designs
    users ||--o{ agent_skills : registers
    users ||--o{ content_batches : launches
    users ||--o{ post_items : creates
    users ||--o{ execution_logs : tracks
    users ||--o{ agent_runs : executes
    users ||--o{ webhooks : manages
    users ||--o{ uploaded_media : caches

    wp_sites ||--o{ content_batches : targets
    wp_sites ||--o{ post_items : publishes_to
    wp_sites ||--o{ uploaded_media : hosts

    content_batches ||--o{ post_items : contains
    post_items ||--o{ execution_logs : logs
    post_items ||--o{ agent_runs : runs
    post_items ||--o{ uploaded_media : uses

    wp_sites {
        uuid id PK
        uuid user_id FK "UNIQUE (user_id, base_url); UNIQUE (id, user_id)"
        text site_name
        text base_url
        text wp_username
        text encrypted_app_password "AES-256-GCM"
        text status "connected | auth_error | rate_limited | unreachable"
        int default_author_id
        int default_category_id
        int max_concurrency "Default: 2, >= 1"
        timestamptz last_checked_at
        timestamptz created_at
        timestamptz updated_at
    }

    user_settings {
        uuid id PK
        uuid user_id FK "UNIQUE (target upsert)"
        text encrypted_openrouter_key
        text encrypted_tavily_key
        text encrypted_brave_key
        text encrypted_serpapi_key
        text encrypted_pexafy_key
        text searxng_url
        jsonb search_preferences "default_provider, default_ai_model?, reasoning_effort?"
        jsonb notification_prefs "flag boolean + langsmith_api_key (terenkripsi), langsmith_project"
        timestamptz created_at
        timestamptz updated_at
    }

    agent_profiles {
        uuid id PK
        uuid user_id FK
        text name "2-100 karakter"
        text description
        text mode "standard | deep"
        text model
        numeric temperature "numeric(3,2), Default: 0.35"
        text workflow_prompt "<= 12000 karakter"
        text_array tool_ids
        text_array skills "Slug agent_skills"
        jsonb limits "maxModelCalls, maxToolCalls, timeoutSeconds, minWordCount, perTool, isDefault"
        text based_on_preset
        int version
        boolean is_archived "Soft delete"
        timestamptz created_at
        timestamptz updated_at
    }

    agent_skills {
        uuid id PK
        uuid user_id FK "NULL hanya untuk skill sistem"
        text name "2-120 karakter"
        text slug "^[a-z0-9_-]+$; UNIQUE (user_id, slug); sistem: UNIQUE (slug) WHERE is_system"
        text description
        text content "Markdown SKILL.md"
        boolean is_system "true <=> user_id IS NULL"
        timestamptz created_at
        timestamptz updated_at
    }

    agent_runs {
        uuid id PK
        uuid post_item_id FK "(post_item_id, user_id) -> post_items"
        uuid user_id FK
        text profile_ref
        jsonb profile_snapshot "ref, name, mode, model, temperature, toolIds, skills"
        text status "running | completed | failed"
        text stop_reason
        int model_calls
        int tool_calls
        int tokens_prompt
        int tokens_completion
        int duration_ms
        int word_count
        text error_message
        timestamptz created_at
        timestamptz finished_at
    }

    content_batches {
        uuid id PK
        uuid user_id FK "UNIQUE (id, user_id)"
        uuid wp_site_id FK "(wp_site_id, user_id) -> wp_sites"
        text name
        text source_type "csv_keywords | niche_auto | external_url | manual"
        text execution_mode "immediate | scheduled_drip | wp_future"
        jsonb ai_config "agentProfileRef, engine, aiModel, language, category_ids, tags, ..."
        jsonb schedule_config "executionMode, mode, random/interval/instantConfig"
        text custom_instructions_override
        text status "draft | running | paused | completed | failed"
        int total_items
        int completed_items "Dihitung ulang dari state post_items"
        timestamptz created_at
        timestamptz updated_at
    }

    post_items {
        uuid id PK
        uuid user_id FK "UNIQUE (id, user_id)"
        uuid batch_id FK "Nullable (Tulis Cepat); (batch_id, user_id) -> content_batches, ON DELETE SET NULL (batch_id)"
        uuid wp_site_id FK "(wp_site_id, user_id) -> wp_sites"
        text target_keyword
        text title
        text slug
        text content_html "Gutenberg Block markup"
        text excerpt
        text featured_image_url
        jsonb categories "Array nama kategori (baris lama: ID numerik)"
        jsonb tags "Array nama tag (baris lama: ID numerik)"
        text custom_instructions_override
        text state "9 state PRD §4 (CHECK)"
        text wp_target_status "publish | future | draft"
        bigint wp_post_id
        text wp_post_url
        int retry_count ">= 0"
        text last_error
        timestamptz scheduled_for
        jsonb source_payload "agentProfileRef, engine, aiModel, style, language, category_ids, batch/schedule meta, wp_publish_meta"
        timestamptz created_at
        timestamptz updated_at "Heartbeat klaim worker"
    }

    execution_logs {
        uuid id PK
        uuid post_item_id FK "(post_item_id, user_id) -> post_items"
        uuid user_id FK
        text step "Teks bebas: init_queue | generation | prepare_sync | wordpress_publisher | status_sync | stale_recovery | <node agen> | ..."
        text level "info | warn | error"
        text message
        jsonb details "input, output, durationMs, metadata"
        timestamptz created_at
    }

    webhooks {
        uuid id PK
        uuid user_id FK
        text name
        text url "Divalidasi assertSafeUrl sebelum disimpan"
        text encrypted_secret "Secret HMAC SHA-256 (AES-256-GCM)"
        jsonb events "Array WebhookEvent"
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    uploaded_media {
        uuid id PK
        uuid user_id FK "NOT NULL"
        uuid site_id FK "(site_id, user_id) -> wp_sites"
        uuid post_id FK "(post_id, user_id) -> post_items, ON DELETE SET NULL (post_id)"
        text source_url "Indeks dedup (site_id, source_url)"
        text site_url
        bigint image_id "ID media WordPress"
        jsonb metadata "alt, caption, title, mime"
        timestamptz created_at
        timestamptz updated_at
    }
```

### 3.1 Model Isolasi Tenant (RLS & Hak Akses)

Semua policy berlaku `TO authenticated` dengan predikat `(select auth.uid()) = user_id` (subselect agar `auth.uid()` dievaluasi sekali per query). Role `anon` tidak memiliki hak apa pun atas 10 tabel. Hak akses (`GRANT`) dinyatakan eksplisit di migrasi — tidak bergantung pada auto-grant Data API.

| Tabel | `authenticated` (client sesi) | Penulis lain |
| :--- | :--- | :--- |
| `wp_sites`, `content_batches`, `agent_profiles`, `user_settings`, `webhooks` | CRUD baris sendiri (UPDATE: `USING` + `WITH CHECK`, `user_id` tidak dapat dipindah) | worker (`service_role`) |
| `agent_skills` | SELECT skill sistem **atau** milik sendiri; INSERT/UPDATE/DELETE hanya skill non-sistem milik sendiri | seed (skill sistem) |
| `post_items` | SELECT, DELETE milik sendiri; INSERT hanya item baru (`state = 'queued_input'`, tanpa `content_html`/`wp_post_id`/`wp_post_url`); **tanpa UPDATE** | transisi state, naskah, `wp_post_id`: hanya worker (`service_role`) |
| `execution_logs` | SELECT + INSERT milik sendiri (append-only) | worker; terhapus via cascade item |
| `agent_runs`, `uploaded_media` | SELECT milik sendiri saja | worker (`service_role`) |

`service_role` (Service Role / secret key) mem-bypass RLS dan hanya dipakai proses latar belakang; kode wajib tetap memfilter `user_id` secara eksplisit (lihat `.claude/rules/security.md`).

### 3.2 FK Komposit Anti Lintas-Tenant

Induk memiliki `UNIQUE (id, user_id)` dan anak merujuk `(fk, user_id)`, sehingga baris anak **tidak mungkin** merujuk induk milik tenant lain — termasuk penulisan via `service_role`:

| FK anak | Induk | ON DELETE |
| :--- | :--- | :--- |
| `content_batches (wp_site_id, user_id)` | `wp_sites (id, user_id)` | CASCADE |
| `post_items (wp_site_id, user_id)` | `wp_sites (id, user_id)` | CASCADE |
| `post_items (batch_id, user_id)` | `content_batches (id, user_id)` | SET NULL (`batch_id`) |
| `execution_logs (post_item_id, user_id)` | `post_items (id, user_id)` | CASCADE |
| `agent_runs (post_item_id, user_id)` | `post_items (id, user_id)` | CASCADE |
| `uploaded_media (site_id, user_id)` | `wp_sites (id, user_id)` | CASCADE |
| `uploaded_media (post_id, user_id)` | `post_items (id, user_id)` | SET NULL (`post_id`) |

### 3.3 Constraint, Indeks & Trigger

- **CHECK**: 9 state `post_items.state`, `wp_target_status`, `retry_count >= 0`, enum status/mode/source (`wp_sites`, `content_batches`, `agent_profiles`, `agent_runs`), `execution_logs.level` (`step` sengaja bebas), format slug & kepemilikan skill sistem, serta bentuk JSON (`jsonb_typeof` object/array) untuk kolom `jsonb`.
- **UNIQUE**: `wp_sites (user_id, base_url)`, `agent_skills (user_id, slug)` + `agent_skills (slug) WHERE is_system`, `user_settings (user_id)`.
- **Indeks antrean**: `post_items (state, scheduled_for)`, `(state, created_at)`, parsial `(updated_at) WHERE state IN ('generating_content','syncing_to_wp')` untuk auto-healing, `(batch_id, state)` untuk progres batch, `(user_id, created_at desc)` untuk daftar antrean. Setiap FK memiliki indeks; dedup media `uploaded_media (site_id, source_url)`.
- **Trigger `set_updated_at`** (BEFORE UPDATE) pada tabel yang memiliki `updated_at`; heartbeat klaim worker bergantung pada kolom ini. Fungsi trigger tidak dapat dieksekusi role API.

### 3.4 Workflow Migrasi

```text
supabase/
├── config.toml                      # Konfigurasi Supabase CLI (project_id "panitera")
├── migrations/<timestamp>_<nama>.sql # Satu-satunya jalur perubahan skema (berurutan, idempoten)
├── seed.sql                         # Skill sistem anti-ai-editor (db reset / --include-seed)
└── tests/                           # Test RLS & constraint berbasis PGlite (tanpa Docker)
```

1. Buat berkas: `npx supabase migration new <nama_perubahan>`; tulis SQL idempoten (`if not exists`, `drop ... if exists` lalu `create`), sertakan RLS + policy + `GRANT` untuk tabel baru di migrasi yang sama.
2. Uji lokal tanpa Docker: `npm run db:test` (menerapkan prelude Supabase + seluruh migrasi + seed ke PGlite, termasuk uji idempotensi), lalu `npm test`.
3. Sebelum push ke production: `npx supabase link --project-ref <ref>`, `npx supabase db diff --linked` (butuh Docker) untuk membandingkan skema, `npx supabase db push --linked --dry-run`, lalu `npx supabase db push --linked`.
4. **Dilarang** mengubah skema lewat skrip Management API (`.workspaces/scripts/migrate-*.js`) atau SQL editor dashboard tanpa migrasi.
5. Baseline wajib diverifikasi terhadap production (query pre-flight di header baseline + `db diff`) sebelum push pertama. Panduan lengkap: skill [`.claude/skills/panitera-db-migration/`](.claude/skills/panitera-db-migration/SKILL.md).

---

## 4. Siklus Hidup Antrean (Queue State Machine)

Setiap artikel berpindah status melalui 9 tahapan yang terukur di kolom `post_items.state`:

```mermaid
stateDiagram-v2
    [*] --> queued_input: Input via Quick Post atau CSV Batch

    queued_input --> generating_content: Worker Claim Lock
    generating_content --> ready_to_sync: Naskah AI Selesai & Lolos Pembersih
    generating_content --> failed_generation: Error LLM / Timeout / Circuit Breaker

    ready_to_sync --> syncing_to_wp: Dispatching ke WordPress REST API
    syncing_to_wp --> published_on_wp: wp_target_status = publish (Live)
    syncing_to_wp --> scheduled_on_wp: wp_target_status = future (WP Cron)
    syncing_to_wp --> saved_draft_on_wp: wp_target_status = draft (Konsep)
    syncing_to_wp --> failed_sync: WP Down / Auth Error / 5xx

    failed_generation --> generating_content: Retry Pembuatan (Generate Ulang)
    failed_sync --> syncing_to_wp: Cost-Saver Retry (Kirim Ulang Tanpa Panggil AI)

    published_on_wp --> [*]
    scheduled_on_wp --> [*]
    saved_draft_on_wp --> [*]
```

### Rincian 9 Status Siklus Hidup (`post_items.state`):

| # | Status (`state`) | Keterangan Sistem | Tindakan Saat Retry |
| :- | :--- | :--- | :--- |
| 1 | `queued_input` | Artikel terdaftar di antrean, menunggu giliran alokasi worker. | - |
| 2 | `generating_content` | Profil agen AI sedang melakukan riset dan menyusun artikel. Terkunci secara atomik. | Diulang jika waktu eksekusi telah kedaluwarsa (> 10 menit). |
| 3 | `ready_to_sync` | Naskah Markdown berhasil dikonversi ke Gutenberg Blocks dan tersimpan di database. | Siap dikirim ke WordPress. |
| 4 | `syncing_to_wp` | Sedang melakukan request HTTP POST ke endpoint WordPress target. | - |
| 5 | `published_on_wp` | Sukses terbit live di WordPress (`status: 'publish'`). ID dan URL artikel tersimpan. | Selesai. |
| 6 | `scheduled_on_wp` | Sukses dijadwalkan di WordPress (`status: 'future'`). Tanggal dan jam tayang terkunci di WP. | Selesai. |
| 7 | `saved_draft_on_wp` | Sukses disimpan sebagai konsep di wp-admin WordPress (`status: 'draft'`). | Selesai. |
| 8 | `failed_generation` | Gagal saat pemanggilan AI (kehabisan kuota, batas loop tercapai, timeout). | Memulai ulang siklus dari riset & drafting. |
| 9 | `failed_sync` | Gagal saat mengirim ke WordPress (kredensial salah, koneksi putus, hosting down), atau item macet di `syncing_to_wp` > 10 menit. | **Cost-Saver Retry**: HTML Gutenberg tersimpan dikirim apa adanya bersama `wp_publish_meta` (tanpa AI, tanpa unggah ulang gambar). Item yang sudah punya `wp_post_id` tidak dipublikasi ulang. |

### Prinsip Keandalan Worker:
1. **Atomic Claim Lock**:
   Sebelum memproses naskah, worker mengeksekusi pembaruan status bersyarat:
   ```sql
   UPDATE post_items 
   SET state = 'generating_content', updated_at = NOW() 
   WHERE id = :id AND state IN ('queued_input', 'failed_generation', 'failed_sync')  -- failed_sync hanya jika belum ada naskah tersimpan
     AND user_id = :userId;  -- wajib untuk permintaan sesi; hanya cron yang tanpa filter user
   ```
   Retry sinkronisasi memakai klaim terpisah `state IN ('failed_sync', 'ready_to_sync') → 'syncing_to_wp'` (fungsi `retryPostItemSync`), sehingga klik ganda hanya menghasilkan satu publikasi. Mencegah dua proses worker paralel mengeksekusi item antrean yang sama.
   Auto-healing: `generating_content` macet → `queued_input` dengan `retry_count + 1` (maks 3, lalu `failed_generation`); `syncing_to_wp` macet → `failed_sync` (tidak pernah generasi ulang).
2. **Cost-Saver Retry (Nol Pemborosan Token AI)**:
   Jika item berada di status `failed_sync` dan `post_items.content_html` sudah terisi di database, worker mendeteksi kondisi `isRetrySync`. Sistem langsung melompati tahap AI dan mengirim ulang konten yang ada ke WordPress REST API.
3. **Pengelompokan Antrean Virtual (Quick Writer Batch)**:
   Artikel mandiri hasil dari *Tulis Cepat* (`batch_id: null`) dikelompokkan secara visual di halaman antrean ke dalam batch virtual `"⚡ Tulis Cepat (Quick Writer)"` sehingga seluruh item tetap terpantau rapi.

---

## 5. Arsitektur Agent Profile Runtime (`src/core/writer/`)

Sistem penulisan artikel beroperasi menggunakan arsitektur modular **Agent Profile Runtime**:

```mermaid
flowchart TD
    subgraph Input["1. Input & Resolusi"]
        REQ["WriterRequest (keyword, site, profileRef, options)"]
        VAL["validateAndSanitizeInput()"]
        PROF["resolveAgentProfile(targetRef)"]
        PRE["pre-resolve.ts (Verifikasi Author, Kategori, Tags di WP)"]
        REQ --> VAL --> PROF --> PRE
    end

    subgraph Runtime["2. Runtime Execution & Guards"]
        AGENT["runAgentWriter() (LangChain / Deep Agent)"]
        TOOLS["Universal Tools Pool (Search, Reader, Images, WP Taxonomy)"]
        GUARDS["Anti-Infinite Loop Guards (Circuit Breaker & Dedup)"]
        PRE --> AGENT
        AGENT <--> GUARDS
        AGENT <--> TOOLS
    end

    subgraph Formatting["3. Formatting & Gutenberg Serialization"]
        CLEAN["markdown-cleaner.ts (Anti-Slop, H1 Normalizer, Pre/Post-amble Stripper)"]
        GUTEN["gutenberg.ts (Deterministic Markdown -> Native WP Gutenberg Blocks)"]
        AGENT --> CLEAN --> GUTEN
    end

    subgraph Output["4. Hasil Terstruktur"]
        RES["WriterResult (GeneratedArticle, WpEnrichment, ExecutionTrace, RunTelemetry)"]
        GUTEN --> RES
    end
```

### Komponen Inti Runtime:
- **`build-agent.ts`**: Menyusun agen runtime LangChain `createAgent` (Standard Mode) atau Deep Agents (Deep Mode) dengan injeksi instruksi `workflowPrompt` kustom dan alat bantu yang diizinkan.
- **`pre-resolve.ts`**: Memeriksa target website WordPress sebelum proses penulisan. Mengambil persona penulis aktif (nama & biografi) serta taksonomi kategori/tags, lalu menyuntikkannya ke prompt agen sehingga artikel ditulis dari sudut pandang author yang sah tanpa penolakan ID author oleh WP REST API.
- **Universal Tools Pool**:
  - `web_search`: Pencarian web faktual via SearXNG, Tavily, atau Brave.
  - `web_reader`: Ekstraksi konten artikel dari URL rujukan untuk riset mendalam.
  - `image_search`: Pencarian gambar bebas royalti via SearXNG Images atau Pexafy API.
  - `upload_media`: Unggah otomatis berkas gambar eksternal ke pustaka WordPress Media Library.
  - `keyword_suggestions`: Penemuan entitas kata kunci LSI dan pencarian terkait.
  - `set_featured_image`: Mencari dan menetapkan gambar sampul landscape.
  - Taksonomi & author WordPress tidak lagi menjadi tool agen; semuanya dikunci oleh Pre-Flight Resolver (`pre-resolve.ts`).
- **Anti-Infinite Loop Guards (`loop-guard.ts` & `guards.ts`)**:
  - *Consecutive Duplicate Tool Call Guard*: Mendeteksi dan memblokir pemanggilan alat dengan parameter persis sama secara berulang.
  - *Circuit Breaker*: Menghentikan eksekusi jika terjadi 2 kali kegagalan pemanggilan alat berturut-turut.
  - *Hard Ceiling Clamp*: Membatasi maksimal pemanggilan model (35 calls) dan batas waktu eksekusi (480 detik).
  - *Emergency Finalize Call*: Jika batas pemanggilan model mendekati limit, sistem memaksa 1x pemanggilan sintesis akhir untuk merangkum hasil yang sudah dikumpulkan menjadi artikel utuh daripada gagal total.
- **Hidden Formatting & Cleaning Engine (`markdown-cleaner.ts`)**:
  - Menghapus pembuka obrolan AI (*"Tentu, ini artikelnya..."*) dan salam penutup (*"Semoga artikel ini membantu..."*).
  - Menghilangkan duplikasi judul H1 di awal paragraf artikel.
  - Menurunkan seluruh heading `# ` internal menjadi `## ` (H2).
  - Menghapus byline terlarang seperti `"Penulis: ..."` agar persona menyatu secara organik dalam gaya narasi.
- **Deterministic Gutenberg Serializer (`gutenberg.ts`)**:
  - Mengonversi sintaks Markdown murni ke blok WordPress Gutenberg resmi: `<!-- wp:heading -->`, `<!-- wp:paragraph -->`, `<!-- wp:image -->`, `<!-- wp:list -->`, `<!-- wp:quote -->`, `<!-- wp:code -->`, `<!-- wp:separator -->`.

---

## 6. Pipeline Pencarian & Kurasi Gambar (SearXNG + Pexafy)

Platform mengadopsi pipeline pencarian mandiri dan bebas ketergantungan biaya API per-pencarian:

1. **SearXNG Engine (Metasearch Mandiri)**:
   - Dijalankan via `docker-compose.yml` di dalam internal network Docker (`http://searxng-internal:8080`).
   - Tidak mengekspos port ke internet luar demi keamanan maksimal.
   - Melayani pencarian teks web dan pencarian gambar tanpa kuota berbayar.
2. **Pexafy API Integration**:
   - Provider foto bebas royalti resolusi tinggi melalui endpoint `https://api.pexafy.com/api/v1/search/photos`.
   - Menghasilkan foto berdimensi landscape ideal untuk *Featured Image* WordPress.
3. **Penyedia Pencarian Web BYOK Alternatif**:
   - Mendukung Tavily API, Brave Search API, dan SerpAPI yang dapat dikonfigurasi pengguna melalui menu **Pengaturan ➔ Kunci API** (`/settings/keys`).

---

## 7. Utilitas AI WordPress (AI-Native WP Tools)

Menu **WP Tools** (`/tools`) menyediakan 3 utilitas bertenaga AI yang berinteraksi langsung dengan WordPress target:

```mermaid
flowchart LR
    subgraph WP["WordPress Target"]
        API["WP REST API (/wp/v2/...)"]
    end

    subgraph ToolsHub["WP Tools Hub (/tools)"]
        T1["Link Building (/tools/link-building)<br/>Scan artikel lama -> Rekomendasi anchor & kalimat -> 1-klik injeksi link"]
        T2["Author Persona (/tools/authors)<br/>Inspeksi author lama -> Rancang persona E-E-A-T -> Registrasi WP user"]
        T3["Category Designer (/tools/categories)<br/>Analisis celah taksonomi -> Rancang 3-6 kategori SEO -> Bulk create di WP"]
    end

    T1 <--> API
    T2 <--> API
    T3 <--> API
```

1. **Internal Link Building Retroaktif (`/tools/link-building`)**:
   - Menganalisis URL artikel baru untuk mengekstrak topik dan entitas kunci.
   - Mencari artikel lama yang relevan di WordPress target via REST API.
   - AI membaca naskah artikel lama dan merancang kalimat penyisipan tautan internal secara alami dengan *anchor text* kontekstual.
   - Pengguna dapat menyalin kalimat rekomendasi atau menerapkan penyisipan otomatis 1-klik ke WordPress via REST API.
2. **Pembuat Persona Penulis E-E-A-T (`/tools/authors`)**:
   - AI menginspeksi profil penulis yang sudah ada di situs WordPress target.
   - Merancang 2–3 profil penulis kredibel dengan biografi persuasif yang relevan dengan niche situs.
   - Menyediakan alur persetujuan, lalu mendaftarkan akun pengguna baru ke WordPress dengan role `author` secara otomatis.
3. **Perancang Taksonomi Kategori (`/tools/categories`)**:
   - AI membaca seluruh kategori aktif di situs target untuk mendeteksi tumpang tindih topik (*cannibalization*).
   - Menghasilkan usulan 3–6 kategori baru yang terstruktur, lengkap dengan slug ramah SEO dan deskripsi kategori.
   - Pengguna dapat memilih dan menerbitkan kategori baru tersebut secara masal ke WordPress.

---

## 8. Outbound Webhooks & Integrasi Eksternal

Platform dilengkapi sistem webhook keluar (*outbound webhooks*) untuk mengirimkan notifikasi event secara real-time ke sistem otomasi eksternal (Make.com, n8n, Zapier, atau backend kustom):

- **Event yang Didukung**:
  - `post.published`: Artikel sukses tayang langsung di WordPress.
  - `post.scheduled`: Artikel sukses dijadwalkan di WordPress untuk tanggal mendatang.
  - `post.draft_saved`: Artikel sukses disimpan sebagai konsep di WordPress.
  - `post.failed`: Pembuatan AI atau sinkronisasi ke WordPress gagal.
  - `batch.completed`: Seluruh item dalam satu batch selesai diproses.
  - `batch.failed`: Seluruh batch mengalami kegagalan fatal.
  - `test.ping`: Event uji coba konektivitas webhook.
- **Keamanan Webhook**:
  - Setiap pengiriman membawa header `X-Panitera-Timestamp` (unix detik) dan `X-Panitera-Signature: sha256=<hex>`, dengan tanda tangan **HMAC SHA-256** atas string `"<timestamp>.<rawBody>"`. Penerima wajib membandingkan secara constant-time dan menolak timestamp yang selisihnya lebih dari 5 menit (anti-replay).
  - Secret webhook dienkripsi menggunakan AES-256-GCM di database; jika secret tidak bisa didekripsi, pengiriman dibatalkan (tidak ada secret cadangan).
  - URL webhook divalidasi Anti-SSRF saat disimpan (`assertSafeUrl`) dan dikirim lewat `safeFetch` tanpa mengikuti redirect.

---

## 9. Katalog Endpoint REST API Internal

Semua route di `src/app/api/` memakai `defineRoute` (`src/server/http/route.ts`, skill `panitera-api-route`):

- **Auth:** `user` (sesi Supabase wajib), `cron` (header `Authorization: Bearer <CRON_SECRET>`), `user-or-cron`, `public` (sesi opsional), `none` (tanpa Supabase).
- **Validasi:** body/query/params lewat skema zod di `src/server/validation/`; input tidak valid → 400 `validation_failed` + `issues`.
- **Respons:** sukses `{ ok: true, ...data }`; error `{ ok: false, error, code, issues? }`. Error Postgres dipetakan tanpa membocorkan detail (23505 → 409, 23503/23514/23502 → 422, 22P02 → 400, 42501 → 403); kegagalan layanan eksternal → 502 `upstream_failed`.
- **Rate limit** (sliding window di memori, per pengguna): `llm` 20/menit, `outboundTest` 15/menit, `enqueue` 30/menit.
- **Logika bisnis** di `src/server/services/<domain>.ts` dengan signature `(supabase, userId, …)`; route tetap tipis. Akses lintas pengguna → 404.

| Rute Endpoint | Metode | Auth & Batasan | Deskripsi & Fungsi |
| :--- | :--- | :--- | :--- |
| `/api/agents` | GET, POST | user | Preset + Agent Profile kustom; POST tervalidasi zod (201) |
| `/api/agents/[id]` | GET, PUT, DELETE | user | `[id]` = UUID atau `preset:*` (GET saja); PUT parsial; DELETE = arsip; preset → 403 |
| `/api/agents/templates` | GET | user | Template workflow prompt profil bawaan |
| `/api/agents/tools` | GET | user | Katalog ToolRegistry + eligibilitas; `?siteId=` opsional (milik pengguna) |
| `/api/ai/models` | GET | user, outboundTest | Katalog model OpenRouter (`?toolsOnly=false`); kunci belum tersimpan via header `x-openrouter-key` |
| `/api/ai/test` | POST | user, llm | Uji kunci OpenRouter (`apiKey` opsional, default kunci BYOK tersimpan); kunci ditolak → 400 |
| `/api/auth/me` | GET | public | Status sesi pengguna saat ini |
| `/api/auth/signout` | POST | public | Mengakhiri sesi (aman dipanggil tanpa sesi) |
| `/api/batches` | GET, POST, DELETE | Manajemen batch ingestion masal |
| `/api/docs` | GET | none | Panduan pengguna `docs/guides/0N-*.md` saja (dokumen internal di `docs/` tidak disajikan maupun ikut ke image) |
| `/api/health` | GET | none | Healthcheck status layanan |
| `/api/lab/registry` | GET | user + Developer Mode | Data pendukung sandbox (situs, agen, tools) |
| `/api/lab/run` | POST | user + Developer Mode, llm | Uji eksekusi tool/agen; kegagalan eksekusi = 200 `ok:false`, keluaran diredaksi |
| `/api/posts` | GET, DELETE | Mengambil daftar artikel & bulk delete artikel |
| `/api/posts/quick` | POST | Eksekusi pembuatan 1 artikel instan (Tulis Cepat) |
| `/api/posts/[id]` | GET, DELETE, PATCH | Mengambil detail artikel, log audit, atau memicu retry sync |
| `/api/queue` | GET | Mengambil item antrean berdasarkan status dan filter |
| `/api/queue/process` | GET, POST | Memicu eksekusi antrean worker. Cron: `Authorization: Bearer <CRON_SECRET>` (atau `x-cron-secret`), tanpa batasan tenant. Sesi pengguna: hanya POST dan hanya item milik pengguna itu. GET khusus cron. |
| `/api/settings/user` | GET, PUT | user | Status kunci BYOK tersamar (`hasKey`) & penyimpanan kunci terenkripsi |
| `/api/settings/search/test` | POST | user, outboundTest | Uji koneksi mesin pencarian (SearXNG/Tavily/Brave/SerpAPI) |
| `/api/sites` | GET, POST | user, outboundTest (POST) | Daftar situs WordPress & pendaftaran situs baru; URL duplikat → 409 |
| `/api/sites/[id]` | DELETE | user | Menghapus situs milik pengguna |
| `/api/sites/[id]/authors` | GET, POST | user | Daftar author WP (`users`) & pendaftaran author baru |
| `/api/sites/[id]/categories` | GET, POST | user | Kategori situs WordPress target & pembuatan kategori baru |
| `/api/sites/connect` | POST | user, outboundTest | Inisialisasi redirect otorisasi Application Passwords (state HMAC) |
| `/api/sites/callback` | GET | public | Callback kredensial dari WordPress; verifikasi state HMAC + sesi di handler; selalu redirect |
| `/api/sites/test` | POST | user, outboundTest | Uji koneksi manual Application Password ke WordPress |
| `/api/skills` | GET, POST | user | Skill sistem + milik sendiri; slug duplikat → 409 |
| `/api/skills/[id]` | GET, PUT, DELETE | user | Detail/ubah/hapus skill; skill sistem baca-saja (403) |
| `/api/tools/categories/suggest` | POST | user, llm | AI perancang taksonomi kategori WordPress (situs milik pengguna) |
| `/api/tools/authors/suggest` | POST | user, llm | AI perancang profil author E-E-A-T (situs milik pengguna) |
| `/api/tools/link-building/analyze` | POST | user, llm | Analisis peluang internal link pada situs WP |
| `/api/tools/link-building/apply` | POST | user, outboundTest | Menyisipkan tautan internal ke artikel lama di WP |
| `/api/webhooks` | GET, POST | user | Daftar webhook & pendaftaran webhook baru (URL divalidasi anti-SSRF) |
| `/api/webhooks/[id]` | PATCH, DELETE | user | Memperbarui atau menghapus konfigurasi webhook |
| `/api/webhooks/[id]/test` | POST | user, outboundTest | Kirim event ping bertanda tangan; penerima gagal → 502 |
