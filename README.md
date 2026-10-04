# WP Autopost & Multi-Site Content Dashboard

Repositori ini adalah workspace **Hybrid (SaaS Application + Agentic Operations Hub)** yang dirancang sesuai **Best Practice Google Antigravity** untuk membangun dan mengoperasikan platform manajemen konten otomatis, *batch posting*, dan *smart scheduling* pada banyak website berbasis WordPress.

---

## Struktur Ekosistem Antigravity di Repo Ini

Repositori ini telah dikonfigurasi dengan *Progressive Disclosure* dan pemisahan konteks agar AI Agent selalu memahami arsitektur, aturan keamanan, dan alur kerja proyek:

```text
wp-autopost-dashboard/
├── AGENTS.md                                      # Master Context & Antigravity Workspace Rules
├── ARCHITECTURE.md                                # Blueprint Arsitektur, Supabase Schema & State Machine
├── DESIGN.md                                      # Design System (Google Stitch / ui-ux-pro-max standard)
├── MEMORY.md                                      # Living Memory, Active Milestones & ADR Decisions
├── .agents/
│   ├── rules/
│   │   └── security.md                            # Standar RLS Multi-Tenant, AES-256-GCM WP App Password, Anti-SSRF
│   ├── worklogs/                                  # Catatan progres detail per fase (token-efficient)
│   ├── mcp_config.json                            # Konfigurasi MCP Server developer (Supabase, Next-DevTools, Fetch)
│   ├── skills/
│   │   └── README.md                              # Panduan instalasi skill eksternal (npx skills add ...)
│   ├── skills.json                                # Registrasi direktori skill lokal
│   └── hooks.json                                 # Lifecycle hooks untuk validasi & pencegahan kebocoran secret
├── .env.example                                   # Template variabel environment
└── .gitignore                                     # Proteksi kredensial & build artifacts
```

---

## Langkah Selanjutnya (Roadmap Pengembangan)

1. **Instalasi Design & Engineering Skills (`skills.sh`)**:
   Tambahkan skill pilihan Anda (seperti `ui-ux-pro-max`) ke `.agents/skills/` untuk mengonsumsi atau mengoptimalkan token visual di [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md).
2. **Inisialisasi Skema Database Supabase**:
   Gunakan blueprint di [`ARCHITECTURE.md`](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md) dan [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md) untuk membuat migrasi SQL (`wp_sites`, `content_batches`, `post_items`, `execution_logs`) beserta kebijakan RLS.
3. **Scaffolding Aplikasi Next.js & Modul `src/core/`**:
   Membangun wrapper `wp-client` (REST API + Application Password + Pre-flight validator) dan *Database-First Queue Engine*.

---

## Deployment Mandiri via Docker Compose (Termasuk SearXNG)

Platform ini mendukung deployment satu perintah menggunakan Docker Compose dengan mesin metasearch mandiri (**SearXNG**) tanpa memerlukan kuota API berbayar dari Tavily atau Brave:

```bash
# 1. Salin template environment
cp .env.example .env

# 2. Sesuaikan kredensial Supabase & Encryption Master Key di .env

# 3. Jalankan container aplikasi + SearXNG
docker compose up -d --build
```

Setelah berjalan:
- **WP Autopost Dashboard**: `http://localhost:3000`
- **SearXNG Instance**: `http://localhost:8080` (terkoneksi otomatis ke aplikasi via internal docker network `http://searxng:8080`)

