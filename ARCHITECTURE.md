# ARCHITECTURE.md — Arsitektur Sistem & State Machine

Dokumen ini adalah cetak biru teknis (*technical blueprint*) untuk platform **WP Autopost & Multi-Site Content Dashboard**. Dokumen ini mendefinisikan arsitektur modular, skema PostgreSQL Supabase, siklus hidup antrean (*queue state machine*), dan kontrak integrasi dengan WordPress REST API.

---

## 1. Prinsip Desain Arsitektur

1. **Strict Core Separation (`src/core/`)**:
   Seluruh logika bisnis murni (komunikasi WordPress REST API, AI Provider Adapter, Content Ingestion, dan Queue Engine) **wajib terisolasi dari komponen UI React/Next.js**. Komponen UI hanya bertindak sebagai *consumer* atau presenter dari modul inti tersebut.
2. **Interface / Adapter Pattern**:
   Setiap interaksi dengan sistem eksternal (AI provider, WordPress hosting, sumber data konten) harus dibungkus dalam *Interface/Adapter* agar penambahan provider atau metode baru di masa depan tidak merombak kode inti (*Open-Closed Principle*).
3. **Database-First State Machine (Single Source of Truth)**:
   Tidak ada pekerjaan batch atau posting yang berjalan sebagai *ephemeral/fire-and-forget* di memori tanpa status yang tersimpan di Supabase. Setiap tahap siklus hidup artikel dicatat dan dapat dilanjutkan jika terjadi *crash* atau *restart*.
4. **Fault-Tolerant & Hosting-Friendly**:
   Setiap pemanggilan ke website WordPress pengguna dilindungi oleh *per-site concurrency throttling* dan *exponential backoff* agar tidak membebani shared hosting pengguna.

---

## 2. Struktur Direktori Proyek

```text
wp-autopost-dashboard/
├── .agents/                        # Konfigurasi ekosistem Antigravity
│   ├── rules/
│   │   └── security.md             # Guardrails keamanan, RLS Supabase & proteksi kredensial
│   ├── skills/                     # Skills proyek & integrasi eksternal (skills.sh)
│   ├── mcp_config.json             # Konfigurasi MCP Server developer (Supabase, Next-DevTools, Fetch)
│   ├── hooks.json                  # Lifecycle safety hooks
│   └── skills.json                 # Manifest registrasi path skills
├── supabase/                       # Konfigurasi & migrasi database Supabase
│   ├── migrations/                 # File SQL migrasi (Tabel, RLS Policies, Indexes, Triggers)
│   └── seed.sql                    # Data dummy untuk pengujian lokal
├── src/
│   ├── app/                        # Next.js App Router (UI Pages & API Route Handlers)
│   │   ├── (auth)/                 # Autentikasi (login, register, forgot-password)
│   │   ├── (dashboard)/            # Dashboard UI (sites, campaigns, queue, scheduler, settings)
│   │   └── api/                    # Endpoint internal, webhook receivers, cron triggers
│   ├── components/                 # Komponen UI React
│   │   ├── ui/                     # Primitif UI (Shadcn/Radix components)
│   │   ├── layout/                 # Sidebar, Header, Global Site Switcher
│   │   └── features/               # Komponen domain (QueueTable, IngestionWizard, BatchCard)
│   ├── core/                       # Business Logic Murni (Framework Agnostic)
│   │   ├── ai-providers/           # Adapter AI (OpenRouter default, OpenAI, Gemini, Anthropic)
│   │   ├── wp-client/              # Client WordPress REST API (Posts, Media, Categories, Healthcheck)
│   │   ├── ingestion/              # Adapter Ingestion (CSVParser, NicheIdeator, UrlExtractor)
│   │   ├── generator/              # AI Article Composer, Anti-AI Humanizer, Media Matcher
│   │   └── queue-engine/           # Queue Manager & Dispatcher (Immediate Batch vs Scheduled Cron)
│   ├── lib/                        # Utilitas bersama (Supabase client, Crypto/AES-256, Logger, Sanitizer)
│   └── types/                      # Definisi TypeScript & Supabase generated database types
├── scripts/                        # CLI tools untuk Agentic Ops & maintenance
├── AGENTS.md                       # Sumber kebenaran utama Antigravity AI Agent
├── ARCHITECTURE.md                 # Dokumen ini (Cetak biru arsitektur & state machine)
├── DESIGN.md                       # Design System & UI tokens (Konvensi Google Stitch / ui-ux-pro-max)
├── README.md                       # Dokumentasi gambaran umum repositori
└── .env.example                    # Template environment variables
```

---

## 3. Skema Inti Database (Supabase PostgreSQL)

Setiap tabel di skema `public` terikat dengan `user_id` yang merujuk ke `auth.users(id)` dan **Row Level Security (RLS)** wajib diaktifkan:

```mermaid
erDiagram
    users ||--o{ wp_sites : owns
    users ||--o{ user_ai_providers : configures
    users ||--o{ content_batches : launches
    wp_sites ||--o{ content_batches : targets
    content_batches ||--o{ post_items : contains
    post_items ||--o{ execution_logs : logs

    wp_sites {
        uuid id PK
        uuid user_id FK
        text site_name
        text base_url
        text wp_username
        text encrypted_app_password
        text status "connected | auth_error | rate_limited | unreachable"
        int default_author_id
        int default_category_id
        int max_concurrency "Default: 2"
        timestamp last_checked_at
        timestamp created_at
    }

    user_ai_providers {
        uuid id PK
        uuid user_id FK
        text provider_type "openrouter | openai | gemini | anthropic | custom_openai"
        text base_url
        text encrypted_api_key
        text default_model
        boolean is_active
        timestamp created_at
    }

    content_batches {
        uuid id PK
        uuid user_id FK
        uuid wp_site_id FK
        text name
        text source_type "csv_keywords | niche_auto | external_url | manual"
        text execution_mode "immediate | scheduled_drip | wp_future"
        jsonb ai_config
        jsonb schedule_config
        text status "draft | running | paused | completed | failed"
        int total_items
        int completed_items
        timestamp created_at
    }

    post_items {
        uuid id PK
        uuid batch_id FK
        uuid user_id FK
        uuid wp_site_id FK
        text target_keyword
        jsonb source_payload
        text title
        text slug
        text content_html
        text excerpt
        text featured_image_url
        jsonb categories
        jsonb tags
        text state "queued_input | generating_content | ready_to_sync | syncing_to_wp | published_on_wp | scheduled_on_wp | saved_draft_on_wp | failed_generation | failed_sync"
        timestamp scheduled_for
        bigint wp_post_id
        text wp_post_url
        text wp_target_status "publish | future | draft"
        int retry_count
        text last_error
        timestamp updated_at
        timestamp created_at
    }

    execution_logs {
        uuid id PK
        uuid post_item_id FK
        uuid user_id FK
        text step "generation | media_upload | post_creation | status_sync"
        text level "info | warn | error"
        text message
        jsonb details
        timestamp created_at
    }
```

---

## 4. Database-First State Machine (`post_items.state`)

Siklus hidup setiap artikel dikendalikan oleh mesin status yang ketat:

```mermaid
stateDiagram-v2
    [*] --> queued_input : Ingest (CSV / Niche / URL)
    queued_input --> generating_content : Worker mulai menulis artikel & riset media
    generating_content --> ready_to_sync : Konten HTML, metadata & media URL siap
    generating_content --> failed_generation : Error kuota AI / timeout LLM
    
    ready_to_sync --> syncing_to_wp : Dispatcher mengirim ke WordPress REST API
    syncing_to_wp --> published_on_wp : Berhasil terbit live (wp_target_status = publish)
    syncing_to_wp --> scheduled_on_wp : Berhasil terjadwal di WP (wp_target_status = future)
    syncing_to_wp --> saved_draft_on_wp : Berhasil tersimpan sebagai draf (wp_target_status = draft)
    syncing_to_wp --> failed_sync : Gagal (WP hosting timeout, auth expired, 5xx)
    
    failed_generation --> queued_input : Retry generasi konten AI
    failed_sync --> ready_to_sync : Retry sync ke WP (TANPA generate ulang AI!)
```

### Keunggulan Kritis:
- **Cost & Token Saver**: Jika artikel gagal diunggah ke WordPress karena server WordPress pengguna mengalami kendala sementara (*downtime/timeout*), status menjadi `failed_sync`. Saat dilakukan *retry*, sistem langsung mengulang dari `ready_to_sync` ke `syncing_to_wp` **tanpa perlu memanggil LLM ulang**.

---

## 5. Dual-Mode Execution Engine

### A. Mode 1: Immediate Batch ("Proses Sekarang")
- Pengguna memilih batch dan menekan tombol *Run Immediately*.
- Worker mengambil item dengan status `queued_input` secara bertahap.
- Menghormati batas `max_concurrency` per situs (default: 2 request simultan per domain WordPress).
- UI Dashboard menampilkan *real-time progress bar* via Supabase Realtime subscription.

### B. Mode 2: Scheduled / Drip-Feed ("Jadwalkan Bertahap")
1. **Pola Dashboard Scheduler (Hold in Database)**:
   - Artikel tetap berstatus `ready_to_sync` dengan kolom `scheduled_for` terisi waktu masa depan.
   - Cron trigger (`/api/cron/process-queue`) memicu worker setiap X menit untuk mengambil artikel yang jatuh tempo (`scheduled_for <= NOW()`) dan mempublikasikannya langsung (`wp_target_status: 'publish'`).
2. **Pola WordPress Native Future (Delegate to WP)**:
   - Artikel langsung dikirimkan ke WordPress dengan parameter `status: 'future'` dan `date_gmt` sesuai target waktu.
   - Mesin cron internal WordPress (`wp-cron.php`) yang akan mengubah statusnya menjadi `publish` pada waktu yang ditentukan.

---

## 6. Standar Integrasi WordPress REST API (Zero-Plugin)

1. **Autentikasi**:
   - Standar HTTP Basic Auth menggunakan kredensial bawaan **WordPress Application Passwords** (`Authorization: Basic base64(username:app_password)`).
   - Pengguna tidak diwajibkan menginstal plugin kustom apa pun.
2. **Pre-Flight Healthcheck (`GET /wp-json/wp/v2/users/me?context=edit`)**:
   - Dijalankan saat pendaftaran situs baru atau verifikasi koneksi berkala.
   - Memastikan permalink aktif, otentikasi valid, dan akun memiliki hak akses (`publish_posts`, `upload_files`).
3. **Pipeline Upload Media (`POST /wp-json/wp/v2/media`)**:
   - Gambar dari Pexels/AI diunduh ke buffer server dashboard, lalu diunggah via multipart form-data ke REST API WordPress beserta `alt_text` dan `caption`.
   - Mengambil `media_id` yang dikembalikan untuk disematkan sebagai `featured_media` pada artikel.
4. **Manajemen Kategori & Tag**:
   - Pencarian kategori: `GET /wp-json/wp/v2/categories?search={name}`.
   - Jika belum ada, otomatis buat baru: `POST /wp-json/wp/v2/categories`.
   - Hasil ID di-cache lokal untuk meminimalkan beban request ke server WordPress.
