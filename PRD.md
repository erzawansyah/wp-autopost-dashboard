# PRD.md — Product Requirement Document

**Nama Produk**: Panitera (WP Autopost & Multi-Site Content Dashboard)  
**Status Dokumen**: Disetujui (Baseline Spesifikasi Produksi Aktif)  
**Target Rilis**: Produksi (Ready for Production)  
**Pemilik Produk**: Pengguna & Tim Engineering Panitera  
**Referensi Silang**:
- Arsitektur & Skema DB → [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Sistem Desain & Token UI → [`DESIGN.md`](DESIGN.md)
- Standar Keamanan Multi-Tenant → [`.claude/rules/security.md`](.claude/rules/security.md)
- Panduan Pengguna Interaktif → [`docs/`](docs/)

---

## 1. Ringkasan Eksekutif & Visi Produk

**Panitera** adalah platform manajemen, otomatisasi, dan orkestrasi konten multi-situs WordPress modern bertenaga **AI Agent Profile Runtime**. Platform ini memungkinkan pemilik jaringan website (solopreneur, niche blogger, agensi konten, digital marketer) untuk memproduksi artikel berkualitas tinggi secara masal, menyusun jadwal tayang bertahap (*smart humanized drip-feed*), memanfaatkan asisten AI untuk optimasi internal link dan taksonomi, serta menerbitkan konten ke banyak website WordPress tanpa perlu memasang plugin custom apa pun (*zero-plugin onboarding*).

### 1.1 Masalah yang Diselesaikan

| # | Masalah | Dampak Tanpa Solusi | Solusi Panitera |
| :- | :--- | :--- | :--- |
| **P1** | Inefisiensi pengelolaan multi-situs | Login berulang kali ke puluhan wp-admin, copy-paste naskah manual, formatting rusak | Dasbor terpusat satu login, multi-site manager dengan otorisasi Application Passwords |
| **P2** | Hosting overload pada shared hosting | Request serentak memicu `503 Service Unavailable` atau ban akun hosting | *Per-site concurrency throttling* (default: 2 request paralel per domain) |
| **P3** | Deteksi bot search engine (kaku) | Penerbitan artikel masal pada menit/detik bulat mudah dikenali sebagai bot | *Smart Humanized Drip-Feed*: Jendela jam aktif + acak menit (*randomized minute jitter*) |
| **P4** | Pemborosan kuota & biaya token AI | Regenerasi artikel dari awal saat koneksi WordPress gagal | *Cost-Saver Retry*: Status `failed_sync` langsung mengirim ulang naskah tanpa panggil AI lagi |
| **P5** | Ketergantungan plugin & overhead situs | Plugin custom memperberat wp-admin, konflik tema, dan risiko celah keamanan | **Zero-Plugin Onboarding**: Komunikasi murni via WordPress REST API standar bawaan core |
| **P6** | Format artikel AI mentah dan monoton | Naskah AI dipenuhi gaya formulaik, em-dash berlebihan, dan format HTML rusak | **Markdown-First** + Pembersih Anti-Slop tersembunyi + Konversi deterministik ke **Gutenberg Blocks** |
| **P7** | Biaya API pencarian gambar & data | Kuota API pencarian berbayar cepat habis saat memproduksi ratusan artikel | Integrasi **SearXNG Engine** mandiri (tanpa kuota) + **Pexafy API** untuk foto bebas royalti |

---

## 2. Profil Pengguna & Persona Sasaran

### 2.1 Solopreneur & Niche Site Builder
- **Profil**: Mengelola 3 hingga 50 situs WordPress aktif (niche affiliate, portal berita, blog monetisasi iklan).
- **Motivasi**: Menghasilkan volume artikel yang tinggi dengan struktur SEO rapi dan kredibilitas E-E-A-T tanpa membutuhkan tim penulis manual yang besar.
- **Model Penggunaan**: Menggunakan kunci API AI sendiri (*Bring Your Own Key / BYOK*) seperti OpenRouter (Llama 3.3 70B, GPT-4o, Claude, DeepSeek) untuk efisiensi biaya maksimal.
- **Skenario Khas**:
  1. *Tulis Cepat*: Membuat dan menerbitkan 1 artikel topik spesifik dalam hitungan menit.
  2. *Bulk Campaign*: Mengunggah ratusan kata kunci via CSV untuk dijadwalkan terbit bertahap selama 30 hari ke depan.
  3. *Audit & Optimasi*: Memperkuat struktur tautan internal postingan lama secara retroaktif dan merancang profil author E-E-A-T.

---

## 3. Spesifikasi Modul Utama Platform

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PANITERA PUBLISHING DESK                        │
├────────────────────┬─────────────────────────────┬─────────────────────┤
│  MODUL 1:          │  MODUL 2:                   │  MODUL 3:           │
│  Tulis Cepat       │  Bulk Artikel (CSV/List)    │  Artikel Terjadwal  │
│  (/posts/new)      │  (/queue & /batches)        │  (/scheduled)       │
└─────────┬──────────┴──────────────┬──────────────┴──────────┬──────────┘
          │                         │                         │
          ▼                         ▼                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      AGENT PROFILE RUNTIME ENGINE                      │
│      Standard LangChain Agent  vs  Deep Agent (SKILL.md Registry)     │
│   Universal Tools: Web Search, Reader, Image Search, Taxonomy, Authors │
│             Guards: Anti-Loop, Circuit Breaker, Hard Ceiling           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               MARKDOWN-FIRST & GUTENBERG BLOCK SERIALIZER              │
│       Pembersih Anti-Slop -> Penormal Judul H1 -> Native Blocks        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  DATABASE-FIRST 9-STATE QUEUE ENGINE                   │
│   queued_input -> generating -> ready_to_sync -> syncing -> published  │
│                   Atomic Claim Lock + Cost-Saver Retry                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               WORDPRESS REST API (ZERO-PLUGIN ONBOARDING)              │
│       Application Passwords (AES-256-GCM) + Per-Site Throttling (2)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                WP TOOLS & OUTBOUND WEBHOOKS ECOSYSTEM                  │
│   Internal Linker (/tools/link-building) | E-E-A-T (/tools/authors)    │
│   Categories Designer (/tools/categories) | Webhooks (/settings/webhooks)│
└────────────────────────────────────────────────────────────────────────┘
```

---

### Modul 1: Tulis Cepat (Quick Single Post) — `/posts/new`

*Alur kerja cepat saat pengguna ingin menyusun, meninjau, dan menerbitkan 1 artikel langsung ke situs WordPress.*

**Input Pengguna**:
- **Target Keyword / Topik** (*Wajib*): Kata kunci utama artikel.
- **Brief / Catatan Khusus** (*Opsional*): Instruksi sudut pandang, batasan pembahasan, atau penekanan tertentu.
- **Website WordPress Target** (*Wajib*): Memilih dari daftar situs yang berstatus `connected`.
- **Kategori WordPress** (*Opsional*): Memilih kategori aktif dari situs target.
- **Profil Agen AI** (*Wajib*): Memilih agen penulisan (Preset Bawaan atau Profil Agen Kustom dari `/agents`).
- **Aksi Publikasi** (*Wajib*): Radio pilihan `Draft` (simpan draf di wp-admin) atau `Publish` (terbit live).

**Proses Sistem**:
1. Menjalankan `pre-resolve.ts`: Memeriksa target website, mengambil taksonomi dan profil author WordPress aktif untuk diinjeksikan ke konteks penulisan.
2. Memasukkan entri ke `post_items` dan `execution_logs`. Artikel mandiri ini otomatis dihubungkan ke batch virtual `"⚡ Tulis Cepat (Quick Writer)"`.
3. Menjalankan *Agent Profile Runtime* dengan universal tools yang dipilih agen.
4. Menjalankan pembersih `markdown-cleaner.ts` dan serialisasi `gutenberg.ts`.
5. Mengirimkan artikel ke WordPress REST API `/wp-json/wp/v2/posts`.
6. Memperbarui status ke `published_on_wp` atau `saved_draft_on_wp` dan mengembalikan URL artikel.

---

### Modul 2: Bulk Keyword Batch (Impor Masal CSV/List) — `/queue` & `/batches`

*Alur kerja otomatisasi masal untuk kampanye konten jangka panjang.*

**Input Pengguna**:
- **Sumber Input**: Pilihan unggah berkas CSV/Excel atau tempel teks masal (*Paste List*).
- **Interactive Column Mapping**:
  - Kolom `target_keyword` (*Wajib*).
  - Kolom pendukung opsional: `suggested_title`, `category`, `tags`, `author`.
- **Target Website**: Memilih situs WordPress target untuk batch ini.
- **Profil Agen AI**: Memilih profil agen penulisan untuk mengeksekusi seluruh baris batch.
- **Mode Eksekusi**:
  - `Immediate Batch`: Diproses langsung secara berurutan oleh worker antrean.
  - `Scheduled Drip`: Dijadwalkan tayang bertahap sesuai konfigurasi drip-feed scheduler.

**Proses Sistem**:
1. Memvalidasi berkas CSV dan menampilkan pratinjau 5 baris pertama data.
2. Menyimpan kampanye ke tabel `content_batches` dan seluruh baris ke tabel `post_items` dengan status `queued_input`.
3. Jika mode `immediate`, memicu worker antrean `/api/queue/process`.
4. Jika mode `scheduled_drip`, kalkulator jadwal (`date-calculator.ts`) menghitung timestamp acak (*minute jitter*) dalam jendela jam aktif yang ditentukan.

---

### Modul 3: Artikel Terjadwal (Smart Drip-Feed Scheduler) — `/scheduled`

*Mekanisme penjadwalan pintar untuk menyebarkan waktu publikasi secara organik di mata mesin pencari.*

**Fitur Utama**:
- **Visualisasi Kalender & Daftar Timeline**: Menampilkan seluruh artikel berstatus `scheduled_on_wp` atau dalam antrean terjadwal.
- **Algoritma Randomized Minute Jitter**: Menghindari waktu bulat kaku (misal `09:00:00` atau `15:00:00`) dengan menambahkan jeda menit dinamis (contoh: `09:23`, `14:47`, `18:12`).
- **Interval Antar Artikel**: Menjaga jeda minimum antar posting (default: minimal 60 menit) agar artikel tidak terbit berdekatan.
- **Status Future WordPress**: Artikel dikirim ke WordPress REST API dengan parameter `status: 'future'` dan `date: ISO_TIMESTAMP`, sehingga WordPress core yang mengeksekusi publikasi final tepat waktu melalui WP-Cron.

---

### Modul 4: AI-Native WordPress Tools (`/tools`)

*Serangkaian asisten cerdas bertenaga AI yang menginspeksi WordPress via REST API.*

#### 4.1 Internal Link Building Retroaktif (`/tools/link-building`)
- **Fungsi**: Memperkuat internal linking situs dengan menemukan artikel lama yang relevan untuk disisipkan backlink ke artikel baru.
- **Alur Kerja**: Masukkan URL artikel baru ➔ AI menganalisis topik dan mencari postingan lama via REST API ➔ AI membaca konten artikel lama dan merekomendasikan kalimat penyisipan serta *anchor text* natural ➔ Aksi 1-klik terapkan ke WordPress REST API atau salin manual.

#### 4.2 Pembuat Persona Penulis E-E-A-T (`/tools/authors`)
- **Fungsi**: Membangun kredibilitas konten sesuai pedoman Google E-E-A-T (*Experience, Expertise, Authoritativeness, Trustworthiness*).
- **Alur Kerja**: Masukkan tema/niche situs ➔ AI membaca author yang sudah ada di WP ➔ AI merancang 2–3 persona author profesional lengkap dengan latar belakang keahlian dan biografi kredibel ➔ Pengguna menyetujui persona ➔ Sistem mendaftarkan user baru ke WordPress dengan role `author` via REST API.

#### 4.3 Perancang Taksonomi Kategori (`/tools/categories`)
- **Fungsi**: Mencegah kanibalisasi kata kunci dan merapikan arsitektur informasi situs.
- **Alur Kerja**: Masukkan topik niche ➔ AI membaca kategori aktif situs target ➔ AI merancang 3–6 kategori baru yang terstruktur, non-overlapping, lengkap dengan slug SEO dan deskripsi kategori ➔ Pengguna memilih dan menerbitkan masal (*bulk create*) ke WordPress via REST API.

---

### Modul 5: Agent Profile Runtime & Studio (`/agents`)

*Pusat perancangan dan manajemen agen penulisan AI otonom.*

- **Pilihan Mode Agen**:
  - **Standard LangChain Agent**: Menggunakan `createAgent`, cepat, hemat token, ideal untuk alur penulisan langsung dengan tools terarah.
  - **Deep Agent**: Agen otonom dengan penalaran mendalam (*multi-step reasoning*) yang mampu membaca berkas keahlian (`SKILL.md`) dan melakukan penelusuran fakta investigatif.
- **Konfigurasi Fleksibel per Profil**:
  - `workflowPrompt`: Alur instruksi penulisan bebas diedit oleh pengguna.
  - `model`: Pilihan model LLM (OpenRouter) dinamis.
  - `toolIds`: Pemilihan alat bantu mandiri (`web_search`, `web_reader`, `image_search`, `upload_media`, taksonomi WP, author WP).
  - `limits`: Batasan pemanggilan model, batas pemanggilan tool, durasi timeout, dan target minimal jumlah kata.
- **Preset Bawaan Pabrikan**:
  - `Quick Writer`: Penulisan ringkas, cepat, dan hemat token.
  - `Research Writer`: Penulisan artikel mendalam berbasis fakta web dengan kurasi gambar relevan.
  - `Deep Research`: Penulisan komprehensif dengan verifikasi fakta eksternal multi-sumber.

---

### Modul 6: Skill Registry (`/skills`)

*Repositori keahlian editorial berbasis Markdown (`SKILL.md`) untuk Deep Agents.*

- Menyediakan instruksi gaya penulisan dan panduan redaksi tingkat lanjut:
  - **`anti-ai-editor`**: Menghilangkan sidik jari tulisan AI (pola *contrastive negation*, metafora klise, minim burstiness) dan menghasilkan tulisan editorial bahasa Indonesia yang mengalir alami.
- Pengguna dapat membuat modul keahlian baru di `/skills/new` untuk mendefinisikan aturan penulisan brand, tone of voice, atau pedoman SEO spesifik.

---

### Modul 7: Laboratorium Pengujian Agen (`/lab`)

*Lingkungan sandbox terisolasi untuk menguji profil agen sebelum digunakan pada antrean produksi.*

- Pengguna dapat memilih website WordPress, profil agen, memasukkan kata kunci uji coba, dan mengeksekusi agen secara live.
- Menampilkan log telemetri langkah demi langkah (*step events*), pemanggilan tool, respon model, serta pratinjau naskah artikel yang dihasilkan tanpa mencemari data antrean publikasi.

---

### Modul 8: Unified BYOK Hub & Settings (`/settings/*`)

*Sentralisasi seluruh konfigurasi akun dan kredensial eksternal.*

- **Kunci API (`/settings/keys`)**:
  - OpenRouter API Key (akses ke puluhan LLM mutakhir).
  - Web Search Keys: Tavily API, Brave Search API, SerpAPI, atau URL SearXNG mandiri.
  - Pexafy API Key: Kunci kurasi foto beresolusi tinggi bebas royalti.
  - Seluruh kredensial tersimpan dalam bentuk terenkripsi (**AES-256-GCM**) dan tidak pernah dikembalikan ke antarmuka browser.
- **Preferensi Pencarian (`/settings/search`)**: Pemilihan provider pencarian default (Auto, SearXNG, Tavily, Brave, SerpAPI, Bing Scraper).
- **Outbound Webhooks (`/settings/webhooks`)**: Pendaftaran endpoint webhook pihak ketiga (Make, n8n, Zapier) dengan tanda tangan HMAC SHA-256 dan pemilihan event langganan (`post.published`, `post.scheduled`, `post.failed`, `batch.completed`).

---

### Modul 9: Media & Search Engine Pipeline

1. **SearXNG Metasearch Engine**:
   - Berjalan di dalam jaringan internal Docker (`http://searxng-internal:8080`) melalui `docker-compose.yml`.
   - Melayani pencarian web faktual dan pencarian foto bebas biaya kuota API per-panggilan.
2. **Pexafy API Integration**:
   - Menghubungkan dasbor ke repositori fotografi bebas royalti via endpoint resmi Pexafy (`https://api.pexafy.com/api/v1/search/photos`).
   - Otomatis mengunduh dan mengunggah foto terpilih ke pustaka media WordPress target via REST API.

---

## 4. Siklus Hidup Antrean (9-State Machine)

Seluruh pemrosesan artikel diatur oleh **Database-First State Machine** di tabel `post_items.state`:

| # | Status (`state`) | Label UI | Keterangan |
| :- | :--- | :--- | :--- |
| 1 | `queued_input` | Menunggu | Artikel terdaftar di antrean database, menunggu giliran worker. |
| 2 | `generating_content` | Sedang Ditulis | Agen AI sedang meriset dan menulis naskah. Terkunci secara atomik. |
| 3 | `ready_to_sync` | Siap Kirim | Naskah Markdown dan Gutenberg Blocks selesai diproses dan tersimpan di DB. |
| 4 | `syncing_to_wp` | Mengirim ke Web | Naskah sedang dikirim via HTTP POST ke WordPress REST API. |
| 5 | `published_on_wp` | Tayang (Live) | Artikel sukses terbit langsung di WordPress. ID dan URL live tersimpan. |
| 6 | `scheduled_on_wp` | Terjadwal | Artikel sukses dijadwalkan di WordPress untuk tanggal mendatang. |
| 7 | `saved_draft_on_wp` | Draf Tersimpan | Artikel sukses disimpan sebagai konsep di wp-admin WordPress. |
| 8 | `failed_generation` | Gagal Tulis | Kegagalan pada tahap AI (kuota habis, timeout, circuit breaker). |
| 9 | `failed_sync` | Gagal Kirim | Kegagalan koneksi WordPress (auth error, hosting down, timeout WP). |

### Aturan Keandalan:
- **Atomic Claim Lock**: Mencegah tabrakan eksekusi worker ganda.
- **Cost-Saver Retry**: Status `failed_sync` langsung melompati tahap AI dan mengirimkan naskah yang sudah ada di database ke WordPress.

---

## 5. Peta Navigasi Antarmuka (Sitemap)

```
/login                       → Autentikasi Pengguna (Supabase Auth SSR)
/register                    → Pendaftaran Akun Pengguna

/(dashboard)/
├── /                        → Dashboard Overview (KPIs, Recent Posts, Quick Actions)
├── /sites                   → Multi-Site WordPress Manager & Add Site Modal
├── /batches                 → Riwayat & Pemantauan Batch Campaign
├── /queue/items             → Tabel Antrean Lengkap (Grouped by Batch, Status Tabs, Bulk Ops)
├── /posts/new               → Tulis Cepat (Quick Single Post UI)
├── /posts/[id]              → Detail Artikel, Pratinjau Gutenberg, Tab Markdown, & Audit Logs
├── /queue                   → Bulk Artikel (CSV Upload & Column Mapping Wizard)
├── /scheduled               → Kalender & Timeline Artikel Terjadwal
├── /tools                   → WP Tools Hub
│   ├── /tools/link-building → Retroactive Internal Link Building Assistant
│   ├── /tools/authors       → Pembuat Persona Penulis E-E-A-T
│   └── /tools/categories    → Perancang Taksonomi Kategori WordPress
├── /agents                  → Agent Studio (Daftar & Preset Profil Agen)
│   ├── /agents/new          → Formulir Perancangan Profil Agen Baru
│   └── /agents/[id]         → Detail & Konfigurasi Profil Agen
├── /skills                  → Skill Registry (Pustaka Modul SKILL.md)
│   └── /skills/new          → Buat Modul Keahlian Baru
├── /lab                     → Laboratorium Pengujian Agen (Sandbox)
├── /settings                → Pusat Pengaturan Platform
│   ├── /settings/keys       → Unified BYOK Hub (OpenRouter, Search, Pexafy)
│   ├── /settings/search     → Preferensi Mesin Pencarian Web
│   ├── /settings/ai         → Pengaturan Global Model AI
│   ├── /settings/webhooks   → Manajemen Outbound Webhooks
│   └── /settings/profile    → Profil Pengguna & Kata Sandi
└── /docs                    → Dokumentasi Pengguna Interaktif (In-App Reader)
```

---

## 6. Persyaratan Non-Fungsional (NFR)

1. **Keamanan Data Multi-Tenant**:
   - Isolasi 100% menggunakan PostgreSQL Row Level Security (RLS) pada 9 tabel Supabase.
   - Enkripsi kredensial WordPress Application Passwords dan API Keys pengguna menggunakan algoritma **AES-256-GCM**.
   - Dekripsi kredensial dilakukan *server-side only* sesaat sebelum request HTTP ke luar dan dilarang dikembalikan ke browser.
2. **Proteksi Jaringan (Anti-SSRF)**:
   - Validasi URL website WordPress pengguna: wajib menggunakan protokol `https://` (kecuali mode dev lokal), menolak IP privat RFC 1918 (`127.0.0.1`, `10.x`, `192.168.x`, `169.254.x`), dan membatasi timeout koneksi ke 15 detik.
3. **Integritas Konten (Anti-XSS & Anti-Slop)**:
   - Naskah artikel AI disaring oleh pembersih teks tersembunyi (`markdown-cleaner.ts`) untuk menghapus pola AI klise, normalisasi H1, dan sanitasi HTML sebelum disimpan maupun dikirim ke WordPress.
4. **Performa Antrean**:
   - Worker mampu mengeksekusi antrean secara stabil tanpa membebani shared hosting pengguna melalui *per-site concurrency throttling* (maks 2 request paralel per domain).

---

## 7. Status Rilis & Kesiapan Produksi

Seluruh fitur inti yang tercantum dalam dokumen ini **telah terimplementasi secara lengkap di dalam kode produksi**, telah teruji di Laboratorium (`/lab`), dan siap digunakan untuk operasi penerbitan konten multi-situs berskala besar.
