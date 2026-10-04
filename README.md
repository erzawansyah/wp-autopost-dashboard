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
├── .agents/                 # Aturan Antigravity, rules, skills, worklogs, hooks
├── docs/                    # Berkas dokumentasi Markdown panduan pengguna (/docs)
├── searxng/                 # Konfigurasi engine metasearch SearXNG
├── src/
│   ├── app/                 # Next.js App Router (Pages, UI, dan REST API)
│   ├── components/          # Komponen UI Atomic Design (atoms, molecules, organisms, templates)
│   ├── core/                # Logika bisnis murni (writer/, queue/, shared/)
│   ├── lib/                 # Adapter Supabase, crypto, AI, WordPress client, scheduler, webhooks
│   └── types/               # Tipe data TypeScript (settings, skills, webhooks)
├── docker-compose.yml       # Konfigurasi container Next.js + SearXNG
├── Dockerfile               # Konfigurasi build Docker
├── package.json             # Dependensi Next.js 16, LangChain, Supabase, Tailwind v4
└── tsconfig.json            # Konfigurasi TypeScript strict
```

---

## Panduan Memulai Cepat (Quickstart)

### 1. Prasyarat Sistem
- **Node.js**: Versi 20.x atau 22.x LTS.
- **Docker & Docker Compose** (Opsional, sangat direkomendasikan untuk menjalankan SearXNG mandiri).
- **Proyek Supabase**: URL dan API Key (Anon Key & Service Role Key).

### 2. Instalasi Dependensi
```bash
# Clone repository
git clone https://github.com/username/wp-autopost-dashboard.git
cd wp-autopost-dashboard

# Install paket dependensi
npm install
```

### 3. Konfigurasi Lingkungan (`.env.local`)
Salin berkas template lingkungan:
```bash
cp .env.example .env.local
```
Lengkapi variabel environment penting berikut:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Kunci Master Enkripsi AES-256-GCM (Wajib string acak 32 bytes hex / 64 karakter)
ENCRYPTION_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Kunci Cron & Worker Trigger
CRON_SECRET=your-random-cron-secret-token
```

### 4. Menjalankan Server Pengembangan Lokal
```bash
npm run dev
```
Buka browser di `http://localhost:3000`.

---

## Deployment Produksi via Docker Compose (Termasuk SearXNG)

Platform ini mendukung deployment satu perintah menggunakan Docker Compose dengan mesin metasearch mandiri (**SearXNG**) tanpa memerlukan kuota API berbayar:

```bash
# Jalankan container aplikasi Next.js + SearXNG di latar belakang
docker compose up -d --build
```

Setelah berjalan:
- **Panitera Dashboard**: `http://localhost:3000` (atau port publik host yang Anda tentukan).
- **SearXNG Engine**: Berjalan secara terisolasi di dalam Docker network internal (`http://searxng-internal:8080`) **tanpa membuka port ke publik luar**, menjamin keamanan dan mencegah konflik port di server Anda.

---

## Dokumentasi Teknis Terkait

Untuk pemahaman mendalam mengenai arsitektur, siklus antrean, dan sistem desain:
- 📐 **Arsitektur Sistem & Database**: [`ARCHITECTURE.md`](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md)
- 📋 **Spesifikasi Kebutuhan Produk**: [`PRD.md`](file:///d:/Antigravity/wp-autopost-dashboard/PRD.md)
- 🎨 **Sistem Desain & Token Visual**: [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md)
- 🤖 **Pedoman & Standar Perilaku AI Agent**: [`AGENTS.md`](file:///d:/Antigravity/wp-autopost-dashboard/AGENTS.md)
- 🔒 **Standar Keamanan & Proteksi Data**: [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md)
