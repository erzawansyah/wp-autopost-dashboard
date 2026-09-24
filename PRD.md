# PRD.md — Product Requirement Document

**Nama Produk**: WP Autopost & Multi-Site Content Dashboard  
**Status Dokumen**: Disetujui (Baseline Spesifikasi MVP)  
**Target Rilis**: MVP (Phase 1)  
**Pemilik Produk**: Pengguna & Antigravity AI Engineering  
**Referensi Silang**:

- Arsitektur & Skema DB → [`ARCHITECTURE.md`](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md)
- Sistem Desain & Token UI → [`DESIGN.md`](file:///d:/Antigravity/wp-autopost-dashboard/DESIGN.md)
- Standar Keamanan → [`.agents/rules/security.md`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/rules/security.md)

---

## 1. Ringkasan Eksekutif & Visi Produk

**WP Autopost & Multi-Site Content Dashboard** adalah platform SaaS manajemen dan otomatisasi konten multi-situs WordPress. Platform ini memungkinkan pemilik jaringan website (solopreneur, niche blogger, affiliate marketer) untuk memproduksi artikel berbasis kecerdasan buatan (AI) berkualitas tinggi, menyusun jadwal tayang bertahap (_smart humanized drip-feed_), dan menerbitkan konten secara otomatis ke banyak situs WordPress tanpa perlu meng-install plugin khusus (_zero-plugin onboarding_).

### 1.1 Masalah yang Diselesaikan

| #   | Masalah                             | Dampak Tanpa Solusi                                                        | Solusi Platform                                                                               |
| :-- | :---------------------------------- | :------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| P1  | Inefisiensi pengelolaan multi-situs | Login ke puluhan wp-admin, copy-paste manual → puluhan jam/minggu terbuang | Dashboard terpusat satu login, batch operations ke semua situs                                |
| P2  | Shared hosting overload             | Request serentak memicu `503 Service Unavailable` atau ban akun hosting    | Per-site concurrency throttling (maks 2 request paralel/domain)                               |
| P3  | Jejak bot Google penalty            | Publish puluhan artikel di jam/detik yang kaku → mudah terdeteksi bot      | Smart Humanized Drip-Feed: jendela jam aktif + randomized minute jitter                       |
| P4  | Pemborosan token AI                 | Regenerasi artikel dari awal saat koneksi WP putus                         | Cost-Saver Retry: `failed_sync` → retry langsung dari `ready_to_sync` tanpa panggil LLM ulang |
| P5  | Risiko keamanan kredensial tersebar | App Password WP tersimpan di banyak tool tanpa enkripsi                    | AES-256-GCM encryption, server-side only decryption, Supabase RLS                             |

---

## 2. Profil Pengguna & Persona Sasaran

### 2.1 Persona Utama: Solopreneur & Niche Site Builder

- **Profil**: Mengelola antara 3 hingga 30 situs WordPress aktif (niche affiliate, blog monetisasi iklan, portal berita lokal).
- **Motivasi**: Efisiensi waktu dan biaya — ingin menghasilkan konten berkualitas dalam volume tinggi tanpa mempekerjakan tim penulis besar.
- **Kemampuan Teknis**: Menengah — familiar dengan wp-admin, mampu membuat Application Password, namun tidak ingin berurusan dengan koding PHP atau konfigurasi server.
- **Model Penggunaan**: Menggunakan API Key AI sendiri (_Bring Your Own Key / BYOK_) seperti OpenRouter, Claude, GPT, atau DeepSeek untuk efisiensi biaya.
- **Skenario Khas**:
  - Inisialisasi website baru: mengisi 20–50 artikel sekaligus dalam waktu singkat.
  - Pemeliharaan konten rutin: menjadwalkan 2–5 artikel/hari secara otomatis ke beberapa situs.
  - Quick publish: membuat dan menerbitkan 1 artikel spesifik ke situs tertentu dalam hitungan menit.

---

## 3. Spesifikasi Modul & Alur Pengguna (Core Workflows)

Platform dirancang secara modular dengan 3 modul utama ingesti konten, didukung oleh modul media, scheduler, dan integrasi WordPress.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   3 MODUL UTAMA INGESTI KONTEN                         │
├────────────────────┬─────────────────────────────┬─────────────────────┤
│  MODUL 1:          │  MODUL 2:                   │  MODUL 3:           │
│  Quick Single Post │  Bulk Keyword Batch (CSV)   │  Niche Auto-Genesis │
│  (1 Artikel Cepat) │  (Antrean Terjadwal Masal)  │  (Inisialisasi Web) │
└─────────┬──────────┴──────────────┬──────────────┴──────────┬──────────┘
          │                         │                         │
          ▼                         ▼                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 ENGINE MEDIA & FEATURED IMAGE                          │
│   [Switcher ON/OFF] -> 1. Unsplash Stock | 2. Manual URL | 3. AI Image │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             OPENROUTER BYOK GATEWAY + ANTI-AI FILTER                   │
│      Claude 3.5 Sonnet / GPT-4o / DeepSeek V3 + Natural Tone           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               DATABASE-FIRST STATE MACHINE & QUEUE                     │
│  Queued -> Generating -> Ready to Sync -> Syncing WP -> Published/Sched │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 SMART HUMANIZED DRIP-FEED SCHEDULER                    │
│    Jendela Jam Aktif + Acak Menit (Jitter) + Per-Site Throttling (2)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               WORDPRESS REST API (ZERO-PLUGIN ONBOARDING)              │
│       Standard Endpoints (/wp/v2/posts) + Application Passwords        │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Modul 1: Quick Single Post (Pembuatan 1 Artikel Cepat)

_Alur kerja cepat saat pengguna ingin menerbitkan atau mendrafkan satu artikel spesifik ke situs tertentu._

**Input Pengguna**:

| Field                           | Tipe                                       | Wajib | Validasi / Keterangan                                                              |
| :------------------------------ | :----------------------------------------- | :---- | :--------------------------------------------------------------------------------- |
| Website target                  | Select (dari daftar situs aktif)           | ✅    | Hanya situs berstatus `connected`                                                  |
| Target keyword / judul          | Text input                                 | ✅    | Min 3 karakter, maks 200 karakter                                                  |
| Instruksi khusus (custom brief) | Textarea                                   | ❌    | Maks 1.000 karakter (menimpa default prompt template)                              |
| Kategori WP                     | Combobox (Select / Create New)             | ❌    | Pilih dari kategori WP atau ketik nama kategori baru (auto-create di WP via REST) |
| Tags WP                         | Multi-select Tag Input (Select / Type New) | ❌    | Pilih tag yang ada atau ketik tag baru (koma/Enter, auto-create di WP via REST)   |
| Bahasa target                   | Select (`id` / `en`)                       | ❌    | Default: `id` (Indonesia)                                                          |
| Status aksi                     | Radio (`publish` / `draft`)                | ✅    | Default: `draft`                                                                   |
| Featured image                  | Toggle + source selector                   | ❌    | Lihat Modul Media Engine                                                           |

**Proses Sistem**:

1. Validasi situs target masih `connected` (healthcheck cepat jika `last_checked_at` > 15 menit).
2. **Resolusi Taksonomi WP (Kategori & Tag)**:
   - Jika pengguna memilih kategori yang ada: gunakan `wp_category_id`. Jika memasukkan kategori baru: panggil `POST /wp-json/wp/v2/categories` di WordPress target untuk membuat kategori dan mendapatkan ID baru.
   - Untuk setiap tag yang dimasukkan: cocokkan dengan daftar tag WordPress situs target. Jika tag belum ada, panggil `POST /wp-json/wp/v2/tags` untuk auto-create dan peroleh `wp_tag_id`.
3. Membuat record `post_items` di Supabase dengan status `queued_input` lengkap dengan kategori dan tag ID.
4. Memanggil AI Provider via OpenRouter untuk menghasilkan artikel lengkap terstruktur (Heading H2/H3, paragraf mengalir alami, bebas pola formulaik AI).
5. Jika featured image aktif: mencari/generate dan upload media ke WP Media Library.
6. Mengirim payload ke endpoint `/wp-json/wp/v2/posts` WordPress target menyertakan `categories: [id]` dan `tags: [id1, id2, ...]`.
7. Mengembalikan tautan langsung ke live post atau draf di wp-admin WordPress.

**Kriteria Penerimaan (AC)**:

- AC-1.1: Pengguna dapat membuat dan menerbitkan 1 artikel ke situs WordPress dalam < 3 menit dari awal input hingga tautan live.
- AC-1.2: Dropdown kategori terisi otomatis dari REST API situs target (cache 1 jam), dan mendukung opsi pengetikan kategori baru secara instan.
- AC-1.3: Pengguna dapat memilih tag yang sudah ada atau mengetikkan tag baru secara on-the-fly; sistem otomatis membuat tag tersebut di WordPress jika belum ada.
- AC-1.4: Artikel yang dihasilkan tidak mengandung pola klise AI (diverifikasi oleh Anti-AI Filter).
- AC-1.5: Jika situs target `auth_error` atau `unreachable`, tombol submit di-disable dengan pesan error deskriptif.

---

### Modul 2: Bulk Keyword Batch & Scheduled Pipeline (Impor Masal CSV/List)

_Alur kerja otomatisasi masal untuk kampanye konten jangka panjang._

**Input Pengguna**:

| Field                   | Tipe                                       | Wajib       | Validasi / Keterangan                                                          |
| :---------------------- | :----------------------------------------- | :---------- | :----------------------------------------------------------------------------- |
| Sumber input            | Tab switch: CSV Upload / Paste List        | ✅          | —                                                                              |
| File CSV/XLSX           | File upload (drag & drop)                  | Kondisional | Maks 5MB, ekstensi `.csv` / `.xlsx`                                            |
| Paste list              | Textarea (1 keyword/baris)                 | Kondisional | Min 1, maks 500 baris                                                          |
| Column mapping (CSV)    | Interactive mapper                         | Kondisional | Kolom `target_keyword` wajib dipetakan; `category` & `tags` opsional dipetakan |
| Default Batch Category  | Combobox (Select / Create New)             | ❌          | Fallback kategori jika kolom category kosong atau tidak dipetakan              |
| Default Batch Tags      | Multi-select Tag Input                     | ❌          | Tag yang diaplikasikan ke seluruh artikel dalam batch                          |
| Website target          | Select (global) atau per-baris             | ✅          | Minimal 1 situs aktif                                                          |
| Execution mode          | Radio: Immediate / Scheduled Drip          | ✅          | Default: `scheduled_drip`                                                      |
| Jadwal (jika Scheduled) | Date picker + time window + kuota harian   | Kondisional | Lihat Scheduler spec                                                           |
| AI Config override      | Expandable panel (model, tone, word count) | ❌          | Menimpa default setting per-batch                                              |

**Interactive Column Mapping (Detail UX)**:

- Setelah file CSV diunggah, sistem menampilkan **5 baris pertama data** sebagai preview.
- Kolom terdeteksi ditampilkan sebagai dropdown mapping:
  - _Target Keyword_ (Wajib) — dropdown header kolom CSV
  - _Suggested Title_ (Opsional)
  - _Category_ (Opsional — jika belum ada di WP, otomatis dibuat saat sync)
  - _Tags_ (Opsional — dipisahkan koma, jika belum ada di WP, otomatis dibuat saat sync)
  - _Target Site_ (Opsional, jika per-baris)
- Tombol **"Konfirmasi & Masukkan ke Antrean"** aktif hanya setelah kolom wajib dipetakan.

**Proses Penyimpanan & Penjadwalan**:

1. Seluruh baris diparsing dan disimpan ke database Supabase (`content_batches` & `post_items`) dengan status awal `queued_input`.
2. Resolusi kategori dan tags dilakukan per item atau saat sync ke WordPress (auto-create taxonomy via WP REST API jika `wp_category_id` atau `wp_tag_id` belum terdaftar di situs target).
3. Jika mode `immediate`: item langsung masuk ke worker queue.
4. Jika mode `scheduled_drip`: terhubung dengan **Smart Humanized Drip-Feed Scheduler** — pengguna menentukan kuota publikasi per hari dan jendela jam aktif.

**Kriteria Penerimaan (AC)**:

- AC-2.1: CSV dengan 100 baris berhasil diparse dan masuk antrean dalam < 10 detik.
- AC-2.2: Column mapper menampilkan preview 5 baris pertama dengan benar termasuk Unicode/karakter non-Latin, dengan pemetaan kategori & tag.
- AC-2.3: Jika nilai kategori atau tag dalam baris CSV belum ada di WordPress target, sistem otomatis membuatnya tanpa kegagalan sync.
- AC-2.4: Baris duplikat keyword (exact match) dideteksi dan ditandai dengan warning sebelum konfirmasi.
- AC-2.5: Jika file CSV berisi > 500 baris, sistem menampilkan pesan batas dan menolak import.
- AC-2.6: Progress real-time batch ditampilkan via Supabase Realtime subscription (update tanpa refresh).

---

### Modul 3: Niche Site Auto-Genesis (Inisialisasi Website Baru)

_Alur kerja satu-klik untuk mengisi konten website baru atau memulai kategori niche baru dari nol._

**Input Pengguna**:

| Field                    | Tipe                                     | Wajib | Validasi / Keterangan                                                          |
| :----------------------- | :--------------------------------------- | :---- | :----------------------------------------------------------------------------- |
| Situs target             | Select (dari daftar situs aktif)         | ✅    | Status `connected`                                                             |
| Niche / topik utama      | Text input                               | ✅    | Min 5 karakter, maks 300 karakter                                              |
| Jumlah artikel           | Number input + preset buttons (10/20/50) | ✅    | Range: 5–100                                                                   |
| Default Niche Category   | Combobox (Select / Create New)           | ❌    | Kategori umum untuk batch ini (bisa di-override per item di tabel review)      |
| Bahasa target            | Select (`id` / `en`)                     | ✅    | Default: `id`                                                                  |
| Mode output              | Radio: Draft / Publish / Scheduled Drip  | ✅    | Default: `draft`                                                               |

**Proses Sistem (3 Tahap)**:

1. **Topic Ideation Step** (AI-Driven):
   - AI meriset dan menyusun daftar keyword subtopik yang relevan, beragam, dan tidak tumpang tindih (_anti-cannibalization_).
   - Setiap subtopik disertai: keyword utama, suggested title, search intent, suggested category, dan suggested tags (2–4 tag relevan).
   - Durasi estimasi: 10–30 detik tergantung jumlah artikel.

2. **Review & Konfirmasi** (Human-in-the-Loop):
   - Pengguna melihat daftar judul/keyword yang diusulkan dalam tabel interaktif.
   - Kolom tabel review: Checkbox, Keyword, Title, Category (Combobox inline), Tags (Multi-tag chips inline), Search Intent.
   - Pengguna bebas mengubah kategori (pilih yang ada atau ketik baru) dan menambah/menghapus tag per item.
   - Aksi yang tersedia per item: ✏️ Edit inline, 🗑️ Hapus item, ➕ Tambah item manual.
   - **Bulk actions**: Select All, Deselect All, Set Category for Selected, Delete Selected.
   - Tombol **"Setujui & Masukkan ke Antrean"** menampilkan konfirmasi jumlah final.

3. **Queue Ingestion**:
   - Setelah disetujui, seluruh item otomatis masuk ke pipeline antrean dan dieksekusi sesuai mode target output.
   - Kategori dan tag baru yang belum ada di WordPress akan otomatis di-create saat worker melakukan sinkronisasi.

**Kriteria Penerimaan (AC)**:

- AC-3.1: AI menghasilkan daftar keyword yang tidak tumpang tindih (similarity < 70% antar keyword) lengkap dengan rekomendasi kategori dan tags.
- AC-3.2: Pengguna dapat mengedit kategori dan tags secara inline (termasuk membuat baru) sebelum menyetujui antrean.
- AC-3.3: Seluruh kategori dan tags baru yang dibuat berhasil didaftarkan di WordPress via REST API saat publikasi.
- AC-3.4: Proses ideation menampilkan loading skeleton yang informatif selama AI bekerja.
- AC-3.5: Jika AI gagal menghasilkan ideation (timeout/error), error message ditampilkan dengan opsi retry.

---

## 4. Spesifikasi Modul Pendukung

### A. Media Engine & Featured Image Handler

Fitur gambar fleksibel yang dapat dinyalakan atau dimatikan oleh pengguna:

- **Master Switcher**: Toggle **"Sertakan Gambar Unggulan (Featured Image)"** (Default: Aktif).
- **Pilihan Sumber Gambar (Jika Aktif)**:

| Sumber              | Deskripsi                                                   | Batasan                            | Biaya               |
| :------------------ | :---------------------------------------------------------- | :--------------------------------- | :------------------ |
| Unsplash Free Stock | Pencarian otomatis gambar bebas royalti berdasarkan keyword | Rate limit: 50 req/jam (free tier) | Gratis              |
| Manual URL          | Pengguna memasukkan URL gambar eksternal langsung           | Validasi format URL & reachability | Gratis              |
| AI Generated Image  | Synthesis via Flux / DALL-E melalui OpenRouter              | Tergantung kuota API pengguna      | Token BYOK pengguna |

- **Optimasi Otomatis**: Gambar dioptimalkan ukurannya (resize ke max 1200px width, kompresi WebP jika supported) sebelum diunggah ke WordPress Media Library (`/wp-json/wp/v2/media`) dan dikaitkan ke post via `featured_media` ID.

**Kriteria Penerimaan (AC)**:

- AC-4A.1: Toggle image OFF → artikel tetap dikirim tanpa featured image tanpa error.
- AC-4A.2: Unsplash image yang terpilih ditampilkan sebagai preview sebelum konfirmasi.
- AC-4A.3: Jika Unsplash API tidak merespons / rate limited, fallback ke status "tanpa gambar" dengan notifikasi — bukan blocking error.
- AC-4A.4: Upload media ke WP berhasil dan `featured_media` ID terhubung ke post yang benar.

---

### B. Smart Humanized Drip-Feed Scheduler

Mekanisme penjadwalan pintar untuk menjaga pola penerbitan tetap alami di mata mesin pencari:

**Konfigurasi Pengguna**:

| Parameter                 | Tipe Input               | Validasi          | Default                  |
| :------------------------ | :----------------------- | :---------------- | :----------------------- |
| Tanggal mulai             | Date picker              | ≥ hari ini        | Hari ini                 |
| Kuota harian              | Number (artikel/hari)    | Range: 1–20       | 2                        |
| Jendela jam aktif (mulai) | Time picker              | Format 24h        | 08:00                    |
| Jendela jam aktif (akhir) | Time picker              | Harus > jam mulai | 21:00                    |
| Hari aktif                | Multi-checkbox (Sen–Min) | Min 1 hari        | Sen–Jum                  |
| Zona waktu                | Select (dropdown IANA)   | —                 | Auto-detect dari browser |

**Algoritma Randomized Minute Jitter**:

- Alih-alih memposting tepat di jam bulat (misal: 09:00:00 dan 15:00:00 yang kentara sebagai bot), sistem mengacak waktu secara dinamis dalam jendela yang dipilih.
- **Contoh Output** (kuota 2/hari, jendela 08:00–21:00):
  - Hari 1: 09:23 dan 14:47
  - Hari 2: 10:08 dan 16:32
  - Hari 3: 08:41 dan 19:15
- Interval minimum antar posting di hari yang sama: **60 menit** (mencegah 2 artikel muncul terlalu berdekatan).
- Sinkronisasi zona waktu mengikuti setting WordPress target pengguna.

**Kriteria Penerimaan (AC)**:

- AC-4B.1: Waktu yang di-generate tidak pernah jatuh di luar jendela jam aktif.
- AC-4B.2: Interval antar posting di hari yang sama ≥ 60 menit.
- AC-4B.3: Jika kuota harian × jumlah hari < total item antrean, sistem menampilkan estimasi tanggal selesai sebelum konfirmasi.
- AC-4B.4: Hari non-aktif (misal Sabtu/Minggu jika tidak dicentang) dilewati tanpa error.

---

### C. WordPress Multi-Site Connection Manager

**Alur Registrasi Situs Baru (Redirect Callback Authorization)**:

WordPress sejak versi 5.6 mendukung **Application Passwords Authorization Flow** melalui endpoint `authorize-application.php`. Dashboard memanfaatkan mekanisme ini agar pengguna tidak perlu copy-paste password secara manual.

```
Pengguna klik "+ Connect New Site"
    │
    ▼
┌───────────────────────────────────────────┐
│ Step 1: Masukkan URL Situs                │
│ ┌───────────────────────────────────────┐ │
│ │ URL Situs: [https://domain.com      ] │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ○ Otorisasi Otomatis (Recommended)        │
│   → Redirect ke WordPress Anda untuk      │
│     approve akses secara langsung.         │
│                                           │
│ ○ Masukkan Manual (Fallback)              │
│   → Salin-tempel Application Password     │
│     yang sudah dibuat di wp-admin.         │
│                                           │
│                       [Lanjut / Connect ▸]│
└───────────────────────────────────────────┘
    │
    │ ← Jika mode "Otorisasi Otomatis":
    ▼
┌───────────────────────────────────────────┐
│ Step 2: Redirect ke WordPress             │
│                                           │
│ Dashboard membuka tab/window baru:        │
│ {wp_url}/wp-admin/authorize-application.. │
│   ?app_name=WP+Autopost+Dashboard         │
│   &app_id={unique-uuid}                   │
│   &success_url={dashboard_callback_url}   │
│   &reject_url={dashboard_reject_url}      │
│                                           │
│ ┌─ Di sisi WordPress ─────────────────┐   │
│ │ Jika belum login → halaman login WP │   │
│ │ Setelah login → halaman otorisasi:  │   │
│ │                                     │   │
│ │ "WP Autopost Dashboard ingin        │   │
│ │  terhubung ke akun Anda"            │   │
│ │                                     │   │
│ │ [Approve / Setujui]  [Reject/Tolak] │   │
│ └─────────────────────────────────────┘   │
└───────────────────────────────────────────┘
    │
    │ ← WordPress redirect ke success_url
    │   dengan parameter: ?user_login=xxx&password=xxxx+xxxx+xxxx+xxxx
    ▼
┌───────────────────────────────────────────┐
│ Step 3: Callback & Verifikasi Otomatis    │
│                                           │
│ Dashboard menerima callback, lalu:        │
│ ☑ Menyimpan username & password secara   │
│   terenkripsi (AES-256-GCM) di Supabase  │
│ ☑ REST API aktif (/wp-json/)             │
│ ☑ Autentikasi valid (users/me)           │
│ ☑ Hak akses publish_posts               │
│ ☑ Hak akses upload_files                │
│ ☑ Fetch kategori berhasil (12 found)     │
│ ☑ Fetch tag berhasil (24 found)          │
│                                           │
│ Status: 🟢 Connected                      │
│                        [Simpan & Lanjut] │
└───────────────────────────────────────────┘
```

**Dua Mode Otorisasi**:

| Mode                              | Alur                                                                                                     | Kapan Digunakan                                                                                                   |
| :-------------------------------- | :------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| **Otorisasi Otomatis (Redirect)** | Redirect ke `authorize-application.php` → user login (jika belum) → Approve → callback dengan kredensial | Default & recommended. Paling aman karena user tidak pernah melihat/menyalin password mentah.                     |
| **Manual Paste (Fallback)**       | User buka wp-admin sendiri → buat App Password → salin-tempel ke form dashboard                          | Untuk kasus: WP versi < 5.6, authorize endpoint diblokir plugin security, atau pengguna lebih nyaman cara manual. |

**Detail Teknis Redirect Flow**:

1. **Pre-flight check**: Sebelum redirect, dashboard melakukan `GET {wp_url}/wp-json/` untuk memastikan REST API aktif. Jika gagal, tampilkan error tanpa redirect.
2. **State parameter**: Dashboard menyimpan `state` token (UUID) di Supabase yang dikaitkan dengan sesi user saat ini. Token ini diverifikasi saat callback diterima untuk mencegah CSRF.
3. **Success callback**: WordPress mengirimkan `user_login` dan `password` sebagai query parameter ke `success_url`. Dashboard langsung meng-capture, mengenkripsi, dan menghapus parameter dari URL (`replaceState`) agar tidak tersimpan di browser history.
4. **Reject callback**: Jika user menolak, WordPress redirect ke `reject_url`. Dashboard menampilkan pesan "Otorisasi ditolak" dengan opsi untuk mencoba ulang atau beralih ke mode manual.
5. **Timeout handling**: Jika user tidak kembali dalam 5 menit, modal di dashboard menampilkan "Menunggu otorisasi..." dengan opsi "Batalkan" atau "Coba Lagi".

**Panduan Dalam-Aplikasi (In-App Guide)**:

- **Untuk mode Redirect**: Tooltip pendek: _"Anda akan diarahkan ke halaman WordPress untuk menyetujui koneksi. Jika belum login, WordPress akan meminta login terlebih dahulu."_
- **Untuk mode Manual (Fallback)**: Collapsible section **"Cara Membuat Application Password"** dengan langkah bernomor:
  1. Login ke WordPress Admin situs Anda.
  2. Buka `Users → Profile → Application Passwords`.
  3. Masukkan nama aplikasi (misal: "WP Autopost Dashboard").
  4. Klik **"Add New Application Password"**.
  5. Salin kode yang muncul dan tempel di form di bawah.

**Connection Health Telemetry**:

| Status                  | Ikon | Warna                      | Kondisi                                                      |
| :---------------------- | :--- | :------------------------- | :----------------------------------------------------------- |
| Connected               | 🟢   | `--color-success`          | REST API 200 OK & App Password valid                         |
| Auth Error              | 🔴   | `--color-destructive`      | Kredensial salah, diblokir firewall/host, atau token revoked |
| Degraded / Rate Limited | 🟡   | `--color-warning`          | Shared hosting lambat, merespons 429/503, atau timeout > 10s |
| Unreachable             | ⚫   | `--color-muted-foreground` | DNS gagal resolve, situs offline total                       |

**Shared Hosting Guard**:

- _Per-site Concurrency Limit_: Maksimal 2 request paralel ke satu domain WordPress.
- Konfigurasi `max_concurrency` per situs (adjustable di halaman settings situs: range 1–5, default 2).

**Kriteria Penerimaan (AC)**:

- AC-4C.1: Pengguna berhasil menghubungkan situs WordPress pertama mereka dalam waktu < 90 detik (via redirect flow).
- AC-4C.2: Redirect flow: user diarahkan ke halaman otorisasi WP, setelah approve, otomatis kembali ke dashboard dengan status `connected`.
- AC-4C.3: Redirect flow: jika user menolak (reject), dashboard menampilkan pesan informatif dengan opsi retry atau fallback manual.
- AC-4C.4: Redirect flow: kredensial dari callback langsung dienkripsi dan parameter dihapus dari URL browser (no history leak).
- AC-4C.5: Redirect flow: state token CSRF divalidasi saat callback — jika tidak cocok, koneksi ditolak.
- AC-4C.6: Manual fallback: tetap tersedia jika `authorize-application.php` tidak bisa diakses (WP < 5.6 atau diblokir plugin).
- AC-4C.7: Pre-flight check memvalidasi REST API aktif sebelum melakukan redirect.
- AC-4C.8: Application Password disimpan terenkripsi (AES-256-GCM) dan tidak pernah dikembalikan ke frontend.
- AC-4C.9: Healthcheck berkala (setiap 15 menit saat dashboard aktif) memperbarui status situs.
- AC-4C.10: Daftar kategori dan tag situs berhasil di-fetch dan di-cache saat koneksi pertama kali.

---

### D. AI Provider & Humanization Engine (OpenRouter BYOK)

**Arsitektur Gateway**:

- OpenRouter sebagai gateway default untuk mengakses model terdepan (Claude 3.5 Sonnet, GPT-4o, DeepSeek V3, Gemini 1.5 Pro).
- Pola Adapter (`AIProviderAdapter`) agar extensible ke provider lain di masa depan.

**Konfigurasi Pengguna (Settings Page)**:

| Field             | Tipe                                              | Validasi                     | Default                       |
| :---------------- | :------------------------------------------------ | :--------------------------- | :---------------------------- |
| Provider          | Select (OpenRouter / OpenAI / Anthropic / Custom) | —                            | OpenRouter                    |
| API Key           | Password input                                    | Format validasi per provider | —                             |
| Default Model     | Select (dinamis berdasarkan provider)             | —                            | `anthropic/claude-3.5-sonnet` |
| Base URL (custom) | Text input                                        | URL valid, HTTPS             | Per provider                  |
| Test koneksi      | Button                                            | Verifikasi API key valid     | —                             |

**Anti-AI Humanization Filter**:

- Mengeliminasi kata-kata klise pembuka robotik (_"Di era digital saat ini...", "Dalam dunia yang serba cepat..."_).
- Mengeliminasi metafora hampa korporat (_"menavigasi lanskap", "fondasi kokoh"_).
- Mengeliminasi pola "contrastive negation" (_"bukan sekadar X, melainkan Y"_).
- Mengeliminasi "significance inflation" (_"revolusioner", "transformatif", "game-changer"_).
- Menyusun struktur paragraf dengan dinamika panjang kalimat (_burstiness_) alami dan heading informatif tanpa istilah generik.
- Diimplementasikan sebagai post-processing layer dan/atau system prompt engineering, **bukan** sebagai penggantian model.

**Kriteria Penerimaan (AC)**:

- AC-4D.1: API Key tersimpan terenkripsi dan tidak pernah ditampilkan ulang setelah disimpan.
- AC-4D.2: Test koneksi AI menampilkan nama model dan saldo/kredit jika API mendukung.
- AC-4D.3: Artikel yang dihasilkan lolos audit pola Anti-AI (tidak mengandung ≥ 3 pola klise dari daftar di atas).
- AC-4D.4: Jika API Key invalid atau kuota habis, error message spesifik ditampilkan (bukan generic "Something went wrong").

---

### E. Queue State Machine & Error Recovery

Setiap artikel dicatat statusnya di database Supabase sesuai siklus hidup berikut (referensi lengkap: [`ARCHITECTURE.md` §4](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md)):

| State                | Keterangan                           | Aksi Saat Error                                     |
| :------------------- | :----------------------------------- | :-------------------------------------------------- |
| `queued_input`       | Masuk ke antrean database            | Menunggu giliran dispatcher                         |
| `generating_content` | AI sedang menyusun artikel           | Jika timeout/error LLM → status `failed_generation` |
| `ready_to_sync`      | Konten & media selesai, siap dikirim | Tersimpan aman di Supabase                          |
| `syncing_to_wp`      | Sedang mengirim data ke WP REST API  | Jika WP down/auth error → status `failed_sync`      |
| `published_on_wp`    | Sukses terbit live di WordPress      | Menyimpan URL live & `wp_post_id`                   |
| `scheduled_on_wp`    | Sukses dijadwalkan di WP Cron        | Menyimpan tanggal tayang & `wp_post_id`             |
| `saved_draft_on_wp`  | Sukses disimpan sebagai draf di WP   | Menyimpan URL draf & `wp_post_id`                   |

**Prinsip Cost-Saver Retry**:

- Jika terjadi kegagalan sinkronisasi WordPress (`failed_sync`), tombol **Retry** HANYA mengulang proses pengiriman ke WordPress (`syncing_to_wp`).
- Sistem **DILARANG** memanggil ulang API AI jika konten artikel sudah sukses dibuat, sehingga kuota token AI pengguna tidak terbuang sia-sia.

**Auto-Retry Policy**:

| Error Type               | Max Retry | Delay Strategy                        | Eskalasi                                            |
| :----------------------- | :-------- | :------------------------------------ | :-------------------------------------------------- |
| WP timeout (408/504)     | 3         | Exponential backoff: 30s → 60s → 120s | `failed_sync` setelah 3x                            |
| WP auth error (401/403)  | 0         | Langsung gagal                        | `failed_sync` + notifikasi "Periksa kredensial"     |
| WP rate limit (429)      | 5         | Respect `Retry-After` header          | `failed_sync` + turunkan concurrency                |
| AI timeout / 5xx         | 2         | Backoff: 10s → 30s                    | `failed_generation`                                 |
| AI quota exhausted (402) | 0         | Langsung gagal                        | `failed_generation` + notifikasi "Top-up kredit AI" |

---

### F. Prompt Customization & Template Engine

_Memberikan fleksibilitas penuh kepada pengguna untuk mengatur, menyempurnakan, dan menguji prompt AI untuk setiap alur kerja pembuatan konten._

Setiap modul di dalam platform menggunakan alur eksekusi LLM yang berbeda. Pengguna dapat mengkustomisasi prompt ini melalui menu **Settings → Prompt Templates** atau memberikan instruksi khusus tambahan (_custom instructions override_) per-batch maupun per-artikel.

**4 Template Bawaan (Factory Defaults)**:

| Template ID | Alur Terkait | Fungsi Utama | Variabel yang Tersedia |
| :--- | :--- | :--- | :--- |
| `quick_post` | Modul 1: Quick Single Post | Menyusun 1 artikel lengkap berstruktur SEO mendalam dan format HTML | `{{keyword}}`, `{{target_site_name}}`, `{{category}}`, `{{tags}}`, `{{target_language}}`, `{{custom_instructions}}` |
| `bulk_post` | Modul 2: Bulk Keyword Batch | Menghasilkan artikel batch dengan gaya konsisten dan integrasi taksonomi | `{{keyword}}`, `{{suggested_title}}`, `{{target_site_name}}`, `{{category}}`, `{{tags}}`, `{{target_language}}`, `{{custom_instructions}}` |
| `niche_ideation` | Modul 3: Niche Auto-Genesis | Riset AI untuk memetakan subtopik, keyword, intent, kategori, dan tags | `{{niche}}`, `{{article_count}}`, `{{target_site_name}}`, `{{target_language}}`, `{{existing_categories}}` |
| `anti_ai_filter` | Modul AI Engine (Post-process) | Memoles teks untuk mengeliminasi pola klise robotik dan menaikkan burstiness | `{{content}}`, `{{target_language}}` |

**Komponen Konfigurasi Prompt per Template**:

1. **System Prompt**: Mendefinisikan peran AI, persona, aturan struktur HTML (hanya gunakan `<h2>`, `<h3>`, `<p>`, `<ul>`, `<ol>`, `<blockquote>`), serta batasan gaya penulisan.
2. **User Prompt Template**: Template instruksi yang menyertakan placeholder variabel dinamis (sintaks `{{variable_name}}`).
3. **Custom Instructions (Global per User)**: Catatan panduan editorial pribadi yang otomatis disisipkan ke variabel `{{custom_instructions}}` jika tidak diisi spesifik di level batch.
4. **Overrides Bertingkat**:
   - Level Global User: dari menu Prompt Templates.
   - Level Batch: kolom `custom_instructions_override` pada form Bulk/Niche.
   - Level Item: kolom `custom_instructions_override` pada detail single post.

**Fitur Manajemen & Keamanan Prompt**:

- **Template Versioning Otomatis**: Setiap kali pengguna mengubah dan menyimpan template, sistem otomatis mencatat snapshot versi sebelumnya ke tabel `prompt_template_versions`.
- **Riwayat Versi & One-Click Rollback**: Pengguna dapat melihat daftar riwayat revisi (timestamp, ringkasan perubahan) dan mengembalikan template ke versi sebelumnya dengan satu klik.
- **Live Preview & Test Render**: Modal pengujian di mana pengguna dapat memasukkan dummy input dan melihat hasil interpolasi prompt sebelum disimpan.
- **Factory Reset**: Tombol "Kembalikan ke Default" yang mengembalikan system prompt dan template ke standar optimal bawaan platform.

**Kriteria Penerimaan (AC)**:

- AC-4F.1: Pengguna dapat mengedit dan menyimpan system prompt serta user prompt template untuk ke-4 template inti.
- AC-4F.2: Variabel dinamis `{{variable}}` berhasil diinterpolasi dengan data aktual saat eksekusi artikel.
- AC-4F.3: Setiap penyimpanan perubahan memicu pembuatan entri riwayat versi baru tanpa menimpa data historis eksekusi sebelumnya.
- AC-4F.4: Fitur Rollback sukses memulihkan template ke snapshot versi yang dipilih.
- AC-4F.5: Fitur Factory Reset berhasil mengembalikan template ke kondisi default pabrikan.

---

### G. Internal REST API Architecture Foundation

Untuk memastikan dashboard dapat beroperasi secara modular, decoupled, serta mendukung otomasi eksternal atau headless client di masa depan, seluruh fungsionalitas inti didukung oleh **35 Internal REST API Routes** yang terorganisir rapi (referensi lengkap: [`ARCHITECTURE.md` §7](file:///d:/Antigravity/wp-autopost-dashboard/ARCHITECTURE.md)):

- **Sites API** (`/api/sites`): CRUD situs WP, healthcheck telemetry, dan fetch kategori/tags.
- **WP Auth Callback** (`/api/sites/callback`): Penanganan redirect callback dari WordPress `authorize-application.php`.
- **Content Ingestion API** (`/api/content`): Endpoint untuk Quick Post, Bulk CSV Import, dan Niche Genesis.
- **Batch & Queue API** (`/api/batches`, `/api/queue`): Kontrol siklus hidup antrean, retry, dan bulk actions.
- **Scheduler API** (`/api/scheduler`): Pengaturan drip-feed dan kalender jadwal.
- **AI & Prompts API** (`/api/ai`, `/api/prompts`): Manajemen provider BYOK serta CRUD, versioning, preview, dan rollback prompt template.
- **Cron & Webhook Endpoints** (`/api/cron/process-queue`, `/api/cron/healthcheck`): Endpoint terlindungi untuk worker background dan monitoring.

---

## 5. Spesifikasi Layar & Halaman UI

### 5.1 Peta Navigasi (Sitemap)

```
/login                      → Halaman login (Supabase Auth)
/register                   → Halaman registrasi
/forgot-password            → Reset password

/(dashboard)/
├── /                       → Dashboard Overview (KPI + Recent Activity)
├── /sites                  → Daftar WordPress Sites + Add Site Modal
│   └── /sites/[id]         → Detail & Settings per Situs
├── /create                 → Content Creation Hub (3 Tab Modul)
│   ├── Tab: Quick Post     → Modul 1 (Single Quick Post)
│   ├── Tab: Bulk Import    → Modul 2 (CSV/List Bulk Pipeline)
│   └── Tab: Niche Genesis  → Modul 3 (Niche Auto-Ideation)
├── /queue                  → Queue Manager (High-Performance Data Table View)
├── /scheduler              → Scheduler Configuration & Calendar View
└── /settings               → User Settings
    ├── Tab: AI Provider    → BYOK Config (OpenRouter / OpenAI / Claude)
    ├── Tab: Prompt Templates → Kustomisasi & Riwayat Versi Prompt per Alur Modul
    ├── Tab: Profile        → Akun & Preferensi
    └── Tab: Billing        → Usage & Quota (post-MVP placeholder)
```

### 5.2 Dashboard Overview (`/(dashboard)/`)

**Komponen Utama**:

1. **KPI Cards Row** (4 kartu horizontal):
   - Total Post Published (angka besar `text-3xl` + trend mini ↑↓)
   - Active Queue Items (angka + status breakdown mini)
   - WP Sync Success Rate (persentase + bar visual)
   - Connected Sites (angka + health summary)

2. **Recent Activity Feed**:
   - 10 item terbaru (post published, batch completed, errors).
   - Setiap item menampilkan: timestamp, situs, keyword, status badge, dan tautan ke detail.

3. **Quick Actions**:
   - Tombol CTA utama: **"+ Buat Konten Baru"** → navigasi ke `/create`.
   - Tombol sekunder: **"+ Hubungkan Situs"** → modal registrasi situs.

### 5.3 Queue Manager (`/(dashboard)/queue`)

_Fokus penuh pada **High-Performance Data Table** untuk visibilitas maksimal terhadap antrean masal tanpa overhead visual Kanban._

**Fitur Utama Data Table**:

1. **Status Filter Tabs (Metric Badges)**:
   - Tab navigasi atas dengan badge hitungan real-time:
     `Semua` | `Queued` | `Generating` | `Ready to Sync` | `Syncing` | `Published` | `Scheduled` | `Drafts` | `Failed`
2. **Toolbar Pencarian & Pemfilteran**:
   - **Search Bar**: Pencarian instan berdasarkan keyword atau judul artikel.
   - **Site Filter Dropdown**: Filter antrean berdasarkan satu atau beberapa situs WordPress tertentu.
   - **Mode Filter**: Filter berdasarkan Immediate vs Scheduled Drip.
   - **Date Range Picker**: Filter rentang tanggal posting/pembuatan.
3. **Struktur Kolom Data Table**:
   - **Checkbox**: Pilihan multi-select baris (mendukung "Select All in Page" dan "Select All Matching Filter").
   - **Keyword / Judul Artikel**: Teks keyword utama, judul yang diusulkan, disertai thumbnail mini featured image (jika ada).
   - **Target Site**: Favicon dan nama domain WordPress yang dituju.
   - **Taksonomi WP**: Badge Kategori dan chips Tag yang terhubung.
   - **Status Badge**: Badge warna semantik sesuai state machine (`queued_input`, `generating_content`, `ready_to_sync`, `syncing_to_wp`, `published_on_wp`, `scheduled_on_wp`, `failed_generation`, `failed_sync`).
   - **Jadwal / Waktu Terbit**: Estimasi tanggal & jam posting terformat (waktu lokal + tooltip ISO timestamp).
   - **Actions Menu (Dropdown •••)**:
     - _Quick Preview Konten_: Modal cepat melihat artikel yang sudah digenerate.
     - _Retry Sync_: Muncul aktif hanya pada status `failed_sync` (tanpa regenerasi AI).
     - _Edit Jadwal_: Ubah waktu publish yang direncanakan.
     - _Buka di WordPress_: Tautan langsung ke live URL atau draf wp-admin.
     - _Hapus dari Antrean_: Hapus record dari antrean.
4. **Floating Bulk Action Bar** (Aktif saat 1 atau lebih baris dicentang):
   - **Retry Selected**: Menjalankan ulang sync WordPress untuk semua item gagal yang dipilih.
   - **Reschedule Selected**: Menggeser jendela jadwal untuk item-item terseleksi.
   - **Change Category/Tags**: Memperbarui taksonomi secara serentak.
   - **Delete Selected**: Menghapus item terpilih dari antrean.
   - **Export to CSV**: Mengunduh daftar item terseleksi dalam format CSV.
5. **Performa & Realtime**:
   - Diimplementasikan menggunakan `@tanstack/react-table` dengan row virtualization agar lancar merender 1.000+ item.
   - Pembaruan baris status secara instan tanpa reload halaman via **Supabase Realtime** subscription.

---

## 6. Edge Cases & Error Handling

### 6.1 WordPress Integration Edge Cases

| Skenario                                                    | Penanganan                                                                                                  |
| :---------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| WordPress site mengaktifkan maintenance mode                | Deteksi response HTML (bukan JSON) → `failed_sync` dengan pesan "Situs dalam mode maintenance"              |
| Application Password di-revoke oleh pengguna di wp-admin    | Healthcheck mendeteksi 401 → update status situs ke `auth_error` + badge merah di sidebar                   |
| WordPress permalink belum diaktifkan (menggunakan `?p=123`) | Healthcheck mendeteksi REST API tidak accessible → error message + panduan aktivasi permalink               |
| Kategori yang dipilih dihapus di WordPress                  | Saat sync: jika category ID return 404, fallback ke "Uncategorized" + warning log                           |
| WordPress disk full (upload media gagal)                    | Error `500` dari `/wp/v2/media` → `failed_sync` dengan pesan "Ruang penyimpanan situs target mungkin penuh" |
| Cloudflare/Security plugin memblokir REST API               | Timeout atau 403 → pesan "Firewall atau plugin keamanan mungkin memblokir akses REST API"                   |

### 6.2 AI Provider Edge Cases

| Skenario                                             | Penanganan                                                                                                 |
| :--------------------------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| API key valid tapi model yang dipilih tidak tersedia | Error spesifik: "Model X tidak tersedia di provider ini. Silakan pilih model lain."                        |
| Content moderation / safety filter menolak prompt    | Log warning + skip item dengan status `failed_generation` + pesan "Konten ditolak oleh filter keamanan AI" |
| Respons AI menghasilkan HTML malformed               | Sanitasi HTML + auto-fix tag yang tidak tertutup sebelum simpan ke DB                                      |
| Rate limit OpenRouter (429)                          | Exponential backoff + status item tetap `generating_content` hingga retry berhasil                         |

### 6.3 Data & User Input Edge Cases

| Skenario                                               | Penanganan                                                                                                                 |
| :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| CSV dengan encoding non-UTF8 (Windows-1252, Shift-JIS) | Deteksi encoding → konversi ke UTF-8, jika gagal → error "Format file tidak didukung"                                      |
| CSV tanpa header row                                   | Tampilkan preview baris pertama dan tanyakan "Apakah baris ini header?"                                                    |
| Keyword duplikat dalam 1 batch                         | Warning sebelum konfirmasi: "3 keyword duplikat terdeteksi" + opsi hapus/retain                                            |
| Pengguna menutup browser saat batch sedang berjalan    | Item yang sedang `generating_content` atau `syncing_to_wp` tetap diproses oleh worker background. Status ter-update di DB. |
| Session expired saat operasi panjang                   | Supabase Realtime reconnect otomatis setelah re-auth. Data tidak hilang karena Database-First.                             |

---

## 7. Persyaratan Non-Fungsional (NFR)

| Kategori          | Requirement                 | Target                        | Cara Verifikasi                                              |
| :---------------- | :-------------------------- | :---------------------------- | :----------------------------------------------------------- |
| **Keamanan**      | Isolasi data multi-tenant   | 100% via Supabase RLS         | RLS policy test per tabel                                    |
| **Keamanan**      | Enkripsi kredensial at-rest | AES-256-GCM                   | Unit test decrypt/encrypt round-trip                         |
| **Keamanan**      | Anti-SSRF                   | Tolak IP privat/RFC 1918      | Validasi URL sebelum setiap request ke WP                    |
| **Keamanan**      | Anti-XSS                    | Sanitasi HTML semua konten AI | DOMPurify/sanitize-html sebelum render & sebelum kirim ke WP |
| **Performa**      | Dashboard initial load      | < 3 detik (LCP)               | Lighthouse audit                                             |
| **Performa**      | Queue table render          | Smooth hingga 1.000 baris     | @tanstack/react-table dengan virtualisasi                    |
| **Performa**      | CSV parse 500 baris         | < 10 detik                    | Benchmark test                                               |
| **Reliabilitas**  | Worker crash recovery       | Resume dari state DB          | Process restart tidak kehilangan data berkat Database-First  |
| **Aksesibilitas** | Kontras teks                | WCAG AA (≥ 4.5:1)             | Automated contrast check di Storybook/Vitest                 |
| **Aksesibilitas** | Keyboard navigation         | Semua aksi utama              | Tab order + focus-visible ring                               |

---

## 8. Batasan Scope MVP (Out of Scope / Tidak Termasuk)

Fitur-fitur berikut secara eksplisit **TIDAK** termasuk dalam scope MVP dan akan dipertimbangkan di fase berikutnya:

| Fitur                                    | Alasan Ditunda                                                         |
| :--------------------------------------- | :--------------------------------------------------------------------- |
| Multi-user / Team collaboration          | Kompleksitas RBAC; persona MVP adalah solopreneur                      |
| Google Search Console integration        | Membutuhkan OAuth flow terpisah; prioritas lebih rendah                |
| RSS Feed auto-ingestion                  | Adapter pattern sudah disiapkan, implementasi di Phase 2               |
| Web scraping dari URL referensi          | Risiko legal dan teknis; perlu riset compliance                        |
| WordPress Plugin companion (opsional)    | Melanggar prinsip zero-plugin untuk MVP                                |
| Billing / Payment gateway                | MVP gratis atau self-hosted; monetisasi di Phase 2                     |
| Mobile responsive layout (< 768px)       | Persona utama bekerja di desktop/laptop; responsif tablet+ saja di MVP |
| Multi-language AI content (selain ID/EN) | Dimulai dengan 2 bahasa; ekspansi di Phase 2                           |
| Bulk editing artikel yang sudah terbit   | Fokus MVP pada creation pipeline, bukan content management             |
| Analytics & reporting dashboard          | Placeholder di navigation, implementasi di Phase 2                     |

---

## 9. Metrik Keberhasilan MVP (KPI)

| KPI                      | Target                                             | Metode Pengukuran                                                   |
| :----------------------- | :------------------------------------------------- | :------------------------------------------------------------------ |
| Zero-Friction Connection | Situs WP terhubung dalam < 90 detik                | Timer dari klik "+ Connect" hingga status `connected`               |
| Batch Throughput         | 20 artikel dieksekusi stabil tanpa hosting timeout | End-to-end test dengan shared hosting simulator                     |
| State Tracking Accuracy  | 100% item antrean mencerminkan status aktual       | Audit: bandingkan `post_items.state` dengan status sebenarnya di WP |
| Cost-Saver Retry         | 0 token AI terbuang pada `failed_sync` retry       | Log audit: pastikan tidak ada panggilan LLM pada retry sync         |
| Content Quality          | < 5% artikel mengandung ≥ 3 pola klise AI          | Sampling audit 20 artikel acak per minggu                           |

---

## 10. Roadmap Rilis

### Fase 1 — MVP (Saat Ini)

| Area                  | Deliverable                                                                |
| :-------------------- | :------------------------------------------------------------------------- |
| Auth & Onboarding     | Supabase Auth (email/password), halaman login/register/forgot-password     |
| Multi-Site Manager    | Redirect callback auth, CRUD situs WP, healthcheck berkala, AES-256-GCM    |
| Content Creation Hub  | 3 modul ingesti (Quick Single, Bulk CSV, Niche Genesis) + custom category & tags |
| Media Engine          | Unsplash stock, Manual URL, AI Image Generation (toggle on/off)            |
| AI Provider           | OpenRouter BYOK gateway, model selector, Anti-AI Humanization Filter       |
| Prompt Customization  | Editor template prompt per modul, variable interpolation, versioning & rollback |
| Queue & State Machine | Database-first queue, 9 states, cost-saver retry, real-time progress       |
| Scheduler             | Smart Humanized Drip-Feed, jitter randomizer, timezone sync                |
| Dashboard & Queue UI  | KPI cards, high-performance Data Table queue with rich filters & bulk ops  |
| Internal REST API     | 35 endpoints REST API modular (/api/sites, /api/queue, /api/prompts, dll.) |
| Security              | AES-256-GCM, RLS, SSRF guard, XSS sanitization, webhook auth               |

### Fase 2 — Post-MVP

| Area                 | Deliverable                                                    |
| :------------------- | :------------------------------------------------------------- |
| Content Sources      | RSS Feed auto-ingestion, URL reference scraping                |
| Collaboration        | Multi-user teams, role-based access (admin/editor/viewer)      |
| Analytics            | Google Search Console integration, posting performance metrics |
| Monetization         | Usage-based billing, subscription tiers                        |
| Content Management   | Bulk edit published articles, revision history                 |
| Internationalization | Tambahan bahasa konten (Jepang, Spanyol, dll.)                 |
