# PRD.md — Product Requirement Document

**Nama Produk**: Panitera (WP Autopost & Multi-Site Content Dashboard)
**Versi**: `0.2.0-dev` (branch `v2`, rombak v2)
**Status Dokumen**: Baseline spesifikasi produk, disinkronkan dengan kode pada Fase 5 rombak v2
**Pemilik Dokumen**: Tim produk & pengembang Panitera (dokumen ini adalah sumber tunggal spesifikasi produk)
**Referensi Silang**:
- Arsitektur, skema DB, dan katalog API → [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Sistem desain & token UI → [`DESIGN.md`](DESIGN.md)
- Standar keamanan multi-tenant → [`.claude/rules/security.md`](.claude/rules/security.md)
- Panduan pengguna (reader in-app `/docs`) → [`docs/guides/`](docs/guides/)
- Status fase & ADR → [`MEMORY.md`](MEMORY.md)

---

## 1. Ringkasan & Visi Produk

**Panitera** adalah dasbor SaaS untuk memproduksi, menjadwalkan, dan menerbitkan artikel ke banyak website WordPress dari satu tempat. Penulisan dikerjakan oleh **Agent Profile** (agen AI yang dapat dikonfigurasi) di antrean latar belakang, lalu dikirim ke WordPress lewat REST API standar tanpa plugin. Sasaran pengguna: pemilik jaringan website (solopreneur, niche blogger, agensi konten, digital marketer).

### 1.1 Masalah yang Diselesaikan

| # | Masalah | Solusi Panitera |
| :- | :--- | :--- |
| P1 | Mengelola banyak wp-admin secara manual | Dasbor terpusat; koneksi website lewat otorisasi Application Password atau input manual |
| P2 | Hosting murah kewalahan oleh request serentak | Batas request paralel per website (`wp_sites.max_concurrency`, 1–10, bawaan 2) |
| P3 | Pola terbit massal yang kaku mudah dikenali | Jadwal tayang pola interval atau tanggal acak dengan variasi menit acak |
| P4 | Token AI terbuang saat koneksi WordPress gagal | Kirim ulang hemat biaya: `failed_sync` dikirim ulang dari naskah tersimpan tanpa LLM |
| P5 | Plugin custom memperberat dan berisiko | Zero-Friction Onboarding: hanya WordPress REST API + Application Passwords |
| P6 | Format naskah AI berantakan | Markdown-first + pembersih tersembunyi + konversi deterministik ke blok Gutenberg |
| P7 | Biaya API pencarian & foto | SearXNG internal, sumber terbuka sebagai cadangan, dan Pexafy (BYOK) untuk foto |

### 1.2 Prinsip Produk

1. **BYOK-only**: setiap tenant memakai kunci API miliknya (OpenRouter wajib; Tavily, Brave, Pexafy, LangSmith opsional) yang disimpan terenkripsi di **Pengaturan → Pusat Kunci API & Model AI** (`/settings/keys`). Tidak ada cadangan kunci platform kecuali operator menyetel `PLATFORM_KEY_ALLOWED=true`. Tanpa kunci OpenRouter, item antrean berakhir `failed_generation` dengan pesan yang mengarahkan ke `/settings/keys`.
2. **Database-first**: setiap job dicatat di Supabase sebelum dieksekusi; tidak ada pemrosesan di dalam request HTTP.
3. **Zero-plugin**: tidak ada fitur inti yang mewajibkan plugin atau edit PHP di WordPress pengguna.
4. **Draft-first**: Tulis Cepat dan alat uji Laboratorium bawaan berstatus draf.

---

## 2. Persona Pengguna

**Solopreneur & niche site builder** — mengelola 3–50 website (afiliasi, portal berita, blog beriklan); memakai kunci OpenRouter sendiri untuk menekan biaya. Skenario khas:

1. *Tulis Cepat*: satu artikel dari satu topik dalam hitungan menit.
2. *Kampanye batch*: puluhan kata kunci dijadwalkan terbit bertahap selama beberapa minggu.
3. *Audit & optimasi*: tautan internal retroaktif, persona author E-E-A-T, dan perapian kategori.

---

## 3. Peta Navigasi (Sitemap)

### 3.1 Sidebar

| Kelompok | Label menu | Rute | Catatan |
| :--- | :--- | :--- | :--- |
| Menu Utama | Dashboard | `/` | |
| Menu Utama | Daftar Website | `/sites` | |
| Menu Utama | Daftar Batch | `/batches` | |
| Menu Utama | Antrean | `/queue/items` | |
| Penerbitan Konten | Tulis Cepat | `/posts/new` | |
| Penerbitan Konten | Tulis Massal | `/queue` | Badge "Batch" |
| Penerbitan Konten | Tulis Terstruktur | `/write/structured` | Badge "CSV" |
| Alat & Konfigurasi | WP Tools | `/tools` | |
| Alat & Konfigurasi | Profil Agen | `/agents` | |
| Alat & Konfigurasi | Skill Registry | `/skills` | Badge "Deep" |
| Alat & Konfigurasi | Laboratorium | `/lab` | Badge "Lab"; hanya tampil bila Developer Mode aktif |
| Alat & Konfigurasi | Pengaturan | `/settings` | |
| Alat & Konfigurasi | Help / Docs | `/docs` | Juga kartu "Help & Docs" di kaki sidebar |

Navbar atas: breadcrumb, tombol tema terang/gelap, dan menu akun (**Kelola Website**, **Keluar**).

### 3.2 Seluruh Rute Halaman

```
(auth)
/login                     Masuk & daftar (tab Masuk / Daftar Baru), mendukung ?next= dan ?tab=register
/register                  Alias → /login?tab=register

(dashboard) — shell & cek sesi di layout; tanpa sesi → /login?next=<path>
/                          Dashboard "Ruang Kerja Penerbitan"
/sites                     Daftar website + dialog Sambungkan Website (Otomatis / Input Manual)
/sites/[id]                Kelola website (status koneksi & cek ulang, sambungkan ulang, pengaturan, kategori & author WP, hapus)
/batches                   Daftar batch
/queue/items               Antrean (?batchId=<uuid|quick-writer>)
/posts/new                 Tulis Cepat
/posts/[id]                Detail artikel (status, ringkasan run, log, naskah)
/queue                     Tulis Massal
/write/structured          Tulis Terstruktur
/tools                     Hub WP Tools
/tools/link-building       Link Building (?site=<uuid>)
/tools/authors             Author Creator (?site=<uuid>)
/tools/categories          Kategori Creator (?site=<uuid>)
/agents                    Katalog Agent Profile (kustom + preset bawaan)
/agents/new                Profil baru / kloning (?cloneFrom=<ref>)
/agents/[id]               Edit profil kustom (preset → dialihkan ke kloning)
/skills                    Skill Registry
/skills/new                Tambah skill
/skills/[id]               Edit skill kustom / baca skill sistem
/lab                       Laboratorium (Developer Mode; tanpa akses → halaman penjelasan)
/settings                  Hub pengaturan
/settings/keys             Pusat Kunci API & Model AI
/settings/profile          Profil & Preferensi Akun (identitas, ganti kata sandi, preferensi, Developer Mode)
/settings/webhooks         Integrasi Webhook
/docs                      Reader panduan pengguna (?doc=<slug>)

Pengalihan lama
/posts → /     /write → /posts/new     /scheduled → /queue     /settings/ai → /settings/keys#model-ai
```

---

## 4. Spesifikasi Modul

### 4.1 Autentikasi & Akun

- Supabase Auth SSR (email + kata sandi, minimal 6 karakter). `src/proxy.ts` menyegarkan sesi, mengalihkan halaman dasbor tanpa sesi ke `/login?next=…` (nilai `next` disanitasi), dan mengalihkan pengguna bersesi dari `/login`.
- Bila proyek mewajibkan konfirmasi email, pendaftaran tanpa sesi kembali ke tab **Masuk** dengan pemberitahuan.
- **Keluar** mencabut sesi di server dan membersihkan cache klien.
- **Ganti kata sandi** (`/settings/profile`, kartu **Keamanan Akun**): kata sandi saat ini diverifikasi di server, kata sandi baru minimal 6 karakter dan berbeda dari yang lama (`POST /api/auth/password`, rate limit 5 per 15 menit). Setelah berhasil, sesi di perangkat/browser lain dikeluarkan; sesi browser ini tetap aktif.

### 4.2 Dashboard (`/`)

- Kartu KPI: **Sudah Terbit**, **Sedang Diproses**, **Draf & Terjadwal**, **Perlu Tindakan**.
- Panel **Website Terhubung** (jumlah website siap pakai; website bermasalah ditandai badge status), pintasan **Mulai Bekerja**, dan tabel **Artikel Terbaru** (50 item, status live).
- Banner **Artikel masuk antrean** setelah Tulis Cepat dengan tautan ke detail artikel; ajakan **Sambungkan Website** bila belum ada website.

### 4.3 Manajemen Website (`/sites`, `/sites/[id]`)

- **Otomatis (disarankan)**: `POST /api/sites/connect` memeriksa REST API, lalu mengarahkan ke `wp-admin/authorize-application.php`. Callback `/api/sites/callback` memverifikasi token state (terikat akun), memvalidasi kredensial ke `/wp-json/wp/v2/users/me`, dan menyimpan website secara upsert per `(user_id, base_url)`, sehingga menyambungkan ulang alamat yang sama memperbarui kredensial. Hasil tampil sebagai banner `?auth_status=…`.
- **Input Manual**: nama tampilan, alamat, username, Application Password; **Cek Koneksi** (`POST /api/sites/test`, tanpa menyimpan) dan **Simpan Website** (`POST /api/sites`, verifikasi ulang; alamat duplikat ditolak 409).
- Validasi alamat: HTTPS wajib di production, tanpa kredensial di URL, alamat privat/loopback ditolak (kecuali `ALLOW_PRIVATE_NETWORK_FETCH=true` di luar production).
- **Status koneksi** (`wp_sites.status`): **Tersambung** (`connected`), **Kredensial ditolak** (`auth_error`: 401, atau 403 dengan kode error kredensial WordPress), **Dibatasi WordPress** (`rate_limited`: 429), **Tidak terjangkau** (`unreachable`: jaringan/timeout, 502/503/504, kode origin Cloudflare). Status ditulis dari request nyata: otomatis saat antrean mengirim artikel (best-effort, tidak pernah menggagalkan job) dan lewat **Cek ulang koneksi** (`POST /api/sites/[id]/check`, menguji Application Password tersimpan lalu menyimpan status + `last_checked_at`). Respons yang tidak menjelaskan kesehatan situs (mis. 404, 403 izin per aksi) tidak mengubah status.
- **Cek ulang koneksi** tersedia di header halaman kelola dan menu aksi tabel website. Tabel menampilkan tautan **Cara memperbaiki** di bawah badge bila status bukan **Tersambung**; halaman kelola menampilkan panel petunjuk per status. Panel **Kredensial ditolak** berisi tombol **Sambungkan ulang**: alur otorisasi WordPress untuk alamat yang sama membuat Application Password baru yang menggantikan yang lama (antrean & pengaturan tetap). Kredensial website, termasuk yang ditambahkan lewat Input Manual, hanya dapat diganti lewat alur otorisasi ini.
- Formulir penulisan dan WP Tools menyembunyikan website berstatus `auth_error` (pasti ditolak sampai disambungkan ulang); `rate_limited`/`unreachable` bersifat sementara sehingga tetap ditawarkan dengan label statusnya.
- Halaman kelola: header (badge status, **Cek ulang koneksi**, **Buka WP Admin**), panel petunjuk, **Pengaturan Website** (nama tampilan, **Batas request paralel** 1–10), panel **Kategori WordPress** (maks. 100) dan **Author WordPress** (baca-saja, tautan ke WP Tools), kartu **Koneksi** (termasuk **Terakhir dicek**), dan **Hapus Website** (kaskade ke batch, antrean, log, dan riwayat agen; post di WordPress tidak terhapus).

### 4.4 Tulis Cepat (`/posts/new`)

- Input wajib: website (hanya yang tersambung), Agent Profile (default pengguna, atau `preset:quick-writer`), bahasa (10 pilihan, bawaan Indonesia), topik, status **Simpan Draf** (bawaan) / **Langsung Terbit**.
- Input lanjutan: kategori WordPress (multi; kosong = dipilih AI dari kategori yang ada), tag (koma; dicocokkan atau dibuat), catatan khusus.
- `POST /api/posts/quick` hanya mencatat satu `post_items` berstatus `queued_input` (tanpa batch; tampil di grup virtual **Tulis Cepat (Quick Writer)**), membangunkan runner, lalu klien dialihkan ke Dashboard.

### 4.5 Tulis Massal (`/queue`)

- Daftar kata kunci, satu baris satu artikel, maksimal 50 unik per batch (duplikat dapat dihapus sekali klik).
- Pengaturan batch: website, Agent Profile, bahasa, strategi jadwal (§4.7), dan opsi lanjutan (nama batch, kategori & tag seluruh batch, instruksi khusus).
- `POST /api/batches` membuat `content_batches` + seluruh `post_items` (`queued_input`, `scheduled_for` per slot), lalu klien dibawa ke `/queue/items?batchId=…`.

### 4.6 Tulis Terstruktur (`/write/structured`)

- Input: tempel teks (CSV/TSV/sel spreadsheet) atau unggah `.csv`/`.tsv`/`.txt` (tidak membaca `.xlsx` langsung). Pemisah (tab, `|`, `;`, `,`) dideteksi otomatis dari karakter dominan; header opsional.
- Pemetaan kolom: kata kunci utama, judul, LSI, fokus/brief, kategori, tag, atau abaikan; pratinjau data per baris. Maksimal 50 baris; batas tiap kolom divalidasi per nomor baris sebelum dikirim.
- Per baris: judul spesifik (kosong = dibuat AI), LSI + fokus digabung ke instruksi khusus artikel, tag baris digabung dengan tag default. Kategori WordPress yang dikirim berasal dari kategori default batch atau pilihan AI; nama kategori per baris saat ini hanya dicatat sebagai label (lihat §8.3).

### 4.7 Strategi Jadwal Tayang (Drip-Feed)

- **Eksekusi**: `immediate` (bawaan; semua item segera ditulis) atau `scheduled_drip` (item diklaim runner 10 menit sebelum `scheduled_for`).
- **Pola**: **Pola Interval** (waktu mulai + jeda 1–720 jam, bawaan 12; variasi acak −10…+10 menit mulai item kedua) atau **Tanggal Acak** (rentang dibagi rata per item, titik acak di setiap bagian, variasi −7…+7 menit). Pratinjau slot (WIB) dihitung di klien; server menghitung ulang saat batch dibuat.
- **Status di WordPress**: **Langsung Terbit** (bawaan batch) dikirim sebagai `future` bila slot masih di masa depan sehingga WordPress (WP-Cron) yang menayangkannya, atau `publish` bila slot sudah lewat; **Simpan Draf** dikirim sebagai `draft`.
- Tidak ada halaman kalender terpisah; artikel terjadwal dipantau di Antrean (filter **Terjadwal**, kolom **Waktu & Publikasi**).

### 4.8 Antrean & Batch (`/queue/items`, `/batches`)

- Tabel TanStack (100 item terbaru): pencarian, filter batch/website/kelompok status (**Semua**, **Dalam Proses**, **Terbit di Web**, **Draf di Web**, **Terjadwal**, **Gagal**), **Kelompokkan per batch** dengan progres, seleksi + aksi massal (**Proses ulang**, **Hapus**).
- **Pembaruan live**: Supabase Realtime Broadcast **privat** per pengguna (topik `user:<uid>:queue` untuk status item dan `user:<uid>:post:<id>` untuk log baru; join diotorisasi policy `realtime.messages`). Bila kanal tidak tersambung, klien jatuh ke polling dengan backoff 5 → 60 detik yang berhenti saat tidak ada item aktif. Indikator: **Live**, **Menyambungkan…**, **Pembaruan berkala**.
- Aksi ulang per state: **Jalankan sekarang** (`queued_input`; abaikan jadwal), **Tulis ulang** (`failed_generation`; pakai ulang checkpoint draf yang valid), **Kirim ulang ke WordPress** (`failed_sync`/`ready_to_sync`; tanpa LLM). Semua aksi hanya menjadwalkan ulang item lalu membangunkan runner.
- Hapus artikel/batch/riwayat Tulis Cepat hanya di Panitera; post WordPress tidak tersentuh.
- **Daftar Batch**: nama, website, strategi jadwal, kemajuan (item sukses / total), status (**Berjalan** → **Selesai** saat semua item berada di state akhir).

### 4.9 Detail Artikel (`/posts/[id]`)

- Header live (judul terisi saat naskah selesai), aksi ulang sesuai state, **Buka di WordPress**.
- **Status pengerjaan** 4 tahap + kendala terakhir; pemberitahuan jadwal percobaan berikutnya (`next_attempt_at`).
- Ringkasan run: biaya (USD), token, panggilan LLM, jumlah percobaan, rincian run terakhir per model (termasuk fallback), checkpoint tersimpan.
- Tab **Log aktivitas** (input/output JSON per langkah) dan **Naskah artikel** (**Baca naskah** tersanitasi DOMPurify, **Kode Gutenberg**, **Instruksi khusus**).

### 4.10 Agent Profile Runtime & Studio (`/agents`)

- Preset bawaan (baca-saja, dapat dikloning): **Quick Writer** (standard, tanpa tools, default), **Research & Media Writer** (standard, 6 tools), **Deep Research Specialist** (deep, 6 tools + skill `anti-ai-editor`).
- Profil kustom: nama, deskripsi, mode `standard` (LangChain `createAgent`) atau `deep` (Deep Agents + skill `SKILL.md`), workflow prompt (Raw/Pratinjau), tools yang diizinkan (dengan status **Siap**/**Perlu konfigurasi**), skill (mode Deep), temperatur, dan batas eksekusi (model calls, tool calls, timeout, minimal kata) yang selalu dijepit ke batas sistem. Satu profil dapat dijadikan default. Hapus = arsip (antrean lama tetap dapat diproses).
- Model: editor tidak menyediakan pilihan model; worker memakai model payload, lalu **Model Default** pengguna, lalu model profil, lalu `OPENROUTER_DEFAULT_MODEL`.
- **6 Universal Tools** (riset & visual saja): `keyword_suggestions`, `web_search`, `web_reader`, `image_search`, `set_featured_image`, `upload_media`.
- Pipeline penulisan: Pre-Flight Resolver (author persona tanpa akun admin teknis selama ada persona lain, kategori dari yang ada, tag dicocokkan/dibuat) → agen menulis Markdown → pembersih anti-slop & normalisasi heading → serializer Markdown → Gutenberg berbasis AST (escape penuh, `[` dinetralkan) → kirim ke WordPress. Guard anti-loop: deduplikasi panggilan identik, circuit breaker tool, kuota global & per-tool, satu kali finalize darurat. Checkpoint `pre_resolve`/`draft` memungkinkan resume tanpa LLM.

### 4.11 Skill Registry (`/skills`)

- Skill sistem (mis. `anti-ai-editor`) baca-saja; skill kustom per akun dapat dibuat (form atau unggah `.md`, termasuk frontmatter `name:`), diedit (slug tetap), dan dihapus.
- Skill hanya dimuat oleh Agent Profile mode Deep yang mencentangnya.

### 4.12 WP Tools (`/tools`)

Semua tool memakai pemilih website di `PageHeader`, butuh website tersambung, dan memakai kunci OpenRouter pengguna untuk analisis AI.

- **Link Building** (`/tools/link-building`): URL artikel baru (+ kata kunci & instruksi opsional) → AI merumuskan 3–4 kueri → cari artikel terbit lama → rekomendasi kalimat & anchor → **Sisipkan ke WordPress** (konfirmasi) atau **Salin HTML**. Server membangun ulang tautan dari URL artikel yang dianalisis dan anchor tervalidasi (anti prompt injection) dan menolak kalimat yang sudah berubah atau sudah bertautan.
- **Author Creator** (`/tools/authors`): AI merancang 2–3 persona E-E-A-T → **Setujui & Buat di WordPress** / **Tolak** / **Setujui semua**; persona dengan email kosong, tidak valid, atau di luar domain website ditandai **Perlu ditinjau** dan tidak ikut massal. Tab manual: peran author/editor/contributor (tanpa administrator).
- **Kategori Creator** (`/tools/categories`): AI merancang 3–6 kategori non-overlapping dengan slug & deskripsi SEO → setujui per item atau massal. Tab manual: satu kategori (dengan induk) atau masal (maks. 50 per kirim).

### 4.13 Laboratorium (`/lab`)

- Hanya untuk akun dengan Developer Mode (`/settings/profile`); dicek di layout server, halaman, dan setiap route `/api/lab/**`.
- Tab **Tools**: jalankan tiap Universal Tool + **WordPress Publisher (Direct Test)** (bawaan draft). Tab **Agent Profile**: run penuh dengan website target atau mode simulasi; hasil berupa naskah, blok Gutenberg, dan telemetri (diredaksi). Run Agent Profile tidak membuat post di WordPress.

### 4.14 Pengaturan (`/settings/*`)

- **Pusat Kunci API & Model AI** (`/settings/keys`): kunci OpenRouter (wajib), model default (katalog OpenRouter yang mendukung tool calling atau ID kustom), tingkat penalaran, mode mesin pencari (Auto Cascade, Tavily, Brave, SerpAPI, SearXNG, Bing Web, Wikipedia), kunci Tavily/Brave/Pexafy/LangSmith + nama proyek LangSmith. Status kunci hanya **Tersimpan terenkripsi** / **Belum diatur**; uji kunci, hapus kunci dengan konfirmasi; form rahasia `method=post` dan tombol simpan aktif setelah hydrate.
- **Profil & Preferensi Akun** (`/settings/profile`): identitas tenant, **Keamanan Akun** (ganti kata sandi, §4.1; form `method=post`, aktif setelah hydrate), tiga preferensi notifikasi (tersimpan; lihat §8.3), dan Developer Mode.
- **Integrasi Webhook** (`/settings/webhooks`): tambah (secret kustom ≥ 16 karakter atau otomatis; ditampilkan sekali), ubah nama/URL/event, aktif/nonaktif, **Tes Ping**, hapus. Event: `post.published`, `post.scheduled`, `post.draft_saved`, `post.failed`, `batch.completed` (`batch.failed` tersedia di daftar tetapi belum dipicu). Pengiriman: JSON `{ id, event, timestamp, data }`, header `X-Panitera-Timestamp`, `X-Panitera-Signature: sha256=HMAC(secret, "timestamp.body")`, `X-Webhook-Event`; via `safeFetch`, tanpa redirect, timeout 6 detik, tanpa pengiriman ulang. URL wajib publik (HTTPS di production).

### 4.15 Dokumentasi In-App (`/docs`)

- Reader server-side untuk `docs/guides/0N-<slug>.md` (urut nomor; judul dari heading `#`), pencarian judul/isi, navigasi sebelumnya/berikutnya, salin Markdown. Markdown dirender tanpa HTML mentah; tautan disaring.

### 4.16 Pipeline Pencarian & Media

- `web_search` mode Auto: Tavily → Brave → SerpAPI (bila tenant punya kunci) → SearXNG (instance pengguna atau internal `http://searxng-internal:8080`) → scraper Bing → Wikipedia.
- `image_search` mode Auto: Pexafy (BYOK) → Bing Image API (hanya bila operator mengizinkan kunci platform) → SearXNG Images → scraper Bing (Creative Commons) → katalog kurasi; lebar minimal 1280 px dengan verifikasi URL gambar.
- Foto diunggah ke Media Library WordPress dengan deduplikasi per website (`uploaded_media`).

---

## 5. Siklus Hidup Antrean (9-State Machine)

Status di `post_items.state` (CHECK constraint di migrasi baseline). Label UI dari `StatusBadge`.

| # | `state` | Label UI | Keterangan |
| :- | :--- | :--- | :--- |
| 1 | `queued_input` | Menunggu | Tercatat; menunggu klaim runner (segera, jadwal drip, atau `next_attempt_at`). |
| 2 | `generating_content` | Sedang Ditulis | Diklaim atomik; Agent Profile menulis naskah. |
| 3 | `ready_to_sync` | Siap Kirim | Naskah final tersimpan; menunggu dikirim. |
| 4 | `syncing_to_wp` | Mengirim ke Web | Request ke WordPress REST API sedang berjalan. |
| 5 | `published_on_wp` | Sudah Terbit | Post tayang; `wp_post_id` & URL tersimpan. |
| 6 | `scheduled_on_wp` | Dijadwalkan | Post `future` di WordPress. |
| 7 | `saved_draft_on_wp` | Tersimpan Draf | Post draf di wp-admin. |
| 8 | `failed_generation` | Gagal Tulis | Gagal di tahap AI (kunci/kuota, batas agen, error permanen, atau percobaan habis). |
| 9 | `failed_sync` | Gagal Kirim | Gagal atau tidak pasti di tahap WordPress. |

Aturan keandalan:

- **Atomic Claim Lock dengan lease**: klaim hanya lewat RPC `claim_post_items` (`FOR UPDATE SKIP LOCKED`, batas per website, round-robin tenant); token klaim unik (`locked_by`) memagari setiap tulis state & heartbeat. Lease kedaluwarsa dipulihkan otomatis; `syncing_to_wp` yang macet menjadi `failed_sync`.
- **Retry otomatis terbatas**: kegagalan sementara diantrekan ulang dengan backoff 1 → 5 menit, maksimal 3 percobaan; kegagalan permanen langsung `failed_*` tanpa membuang token.
- **Kirim ulang hemat biaya**: `failed_sync` → `ready_to_sync` → naskah tersimpan dikirim tanpa LLM.
- **Anti-duplikasi**: request ke WordPress hanya dikirim setelah titik tanpa kembali; timeout/5xx/putus koneksi pada pengiriman tidak dikirim ulang otomatis; item ber-`wp_post_id` dituntaskan sebagai sukses dan kirim ulang manual ditolak.
- **Checkpoint generasi** (`generation_checkpoints`, RPC berpagar lease) memungkinkan **Tulis ulang** dan retry melanjutkan tanpa LLM.

---

## 6. Persyaratan Non-Fungsional

1. **Isolasi tenant**: RLS aktif (force) di 11 tabel (`wp_sites`, `content_batches`, `post_items`, `execution_logs`, `agent_profiles`, `agent_runs`, `agent_skills`, `user_settings`, `webhooks`, `uploaded_media`, `generation_checkpoints`), GRANT eksplisit, FK komposit `(…, user_id)` anti lintas-tenant; `post_items` tidak dapat di-UPDATE oleh `authenticated`. Service Role hanya untuk worker/proses sistem dengan filter `user_id` eksplisit.
2. **Kredensial**: Application Password, kunci BYOK, dan secret webhook dienkripsi AES-256-GCM (`ENCRYPTION_MASTER_KEY`), didekripsi hanya di server, tidak pernah dikembalikan ke browser, ditulis ke log, atau disimpan di localStorage. Log, telemetri, dan respons Lab diredaksi.
3. **Anti-SSRF**: semua fetch ke URL dari pengguna/LLM lewat `safeFetch` (DNS pinning, blokir loopback/RFC 1918/CGNAT/link-local/metadata/IPv6 privat, validasi ulang setiap redirect, batas ukuran respons). Pengecualian hanya `/search` & `/autocompleter` SearXNG platform.
4. **Perlindungan hosting pengguna**: batas paralel per website (bawaan 2), timeout eksplisit (WordPress 15 detik bawaan; uji koneksi 12 detik; kirim post 20 detik), request tulis WordPress tanpa mengikuti redirect.
5. **Rate limit per pengguna** (sliding window di memori proses, satu instance): AI interaktif 20/menit, uji koneksi keluar 15/menit (termasuk cek ulang koneksi website), pembuatan/aksi antrean 30/menit, ganti kata sandi 5/15 menit. Body JSON maks. 1 MB (batch 10 MB). Semua route lewat `defineRoute` (auth eksplisit, validasi zod, respons `{ ok, … }`).
6. **Runner antrean**: tertanam di proses Next.js (`QUEUE_RUNNER=embedded`, bawaan di production): `QUEUE_CONCURRENCY` 1–10 (bawaan 3), lease 900 detik dengan heartbeat, polling idle 5 detik, shutdown bersih. Mode `off` + `CRON_SECRET` untuk cron eksternal (`POST /api/queue/process`, 1 item per pemicu).
7. **Keamanan web**: header global `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (kamera/mikrofon/geolokasi mati). Konten artikel di-escape penuh saat serialisasi dan disanitasi DOMPurify saat pratinjau. Form rahasia memakai `method=post` dan aktif setelah hydrate.
8. **Observabilitas**: metrik biaya, token, model & versi prompt per run (`agent_runs`); tracer LangSmith per tenant (BYOK) tanpa mutasi `process.env`; health check `GET /api/health`.
9. **Kualitas**: TypeScript strict, lint 0 warning, Vitest (unit + test DB PGlite), audit kebersihan (`npm run audit:hygiene`), `next build`, dan e2e Playwright (Supabase lokal + WordPress Playground) dijalankan CI pada setiap PR dan push ke `main`/`v2`.

---

## 7. Status Rilis

**Versi saat ini: `0.2.0-dev` (branch `v2`).**

| Fase rombak v2 | Status | Ringkasan |
| :--- | :--- | :--- |
| Fase 0 — Keamanan | Selesai | BYOK-only, `safeFetch` terpusat, pengerasan antrean & konten, webhook bertanda tangan (ADR-061). |
| Fase 1 — Fondasi | Selesai | Migrasi Supabase + RLS + test PGlite, env tervalidasi, CI & audit kebersihan (ADR-062). |
| Fase 2 — Backend & runner | Selesai | `defineRoute` + service layer, runner antrean tertanam dengan lease (ADR-063). |
| Fase 3 — Inti AI | Selesai | Gateway LLM per run, kontrak tool, registry prompt berversi, checkpoint, serializer AST (ADR-064). |
| Fase 4 — Frontend | Selesai | Route group, RSC + organism klien, Realtime privat, header keamanan, e2e (ADR-065). |
| Fase 5 — Dokumentasi & deploy | Berjalan | Sinkronisasi PRD/README/panduan; runbook deploy Docker Compose/VPS dan upgrade dari versi lama. |

Prasyarat rilis produksi: baseline migrasi dibandingkan dengan production (`supabase db diff`) sebelum `db push`, lalu deploy mengikuti [panduan deploy & operasi](docs/deploy/docker-compose-vps.md) dan, untuk instalasi lama, [runbook upgrade ke v2](docs/deploy/upgrade-ke-v2.md). Fase produk berikutnya setelah v2: **Modul Niche Auto-Genesis & Smart Content Recycling** (disepakati dengan pengguna lebih dulu).

---

## 8. Batasan & Rencana

### 8.1 Di luar cakupan saat ini

- Kalender visual artikel terjadwal (`/scheduled` dialihkan ke Tulis Massal; pemantauan di Antrean).
- Pemilihan author per artikel dari UI (author dipilih Pre-Flight Resolver) dan pemilihan model per Agent Profile dari editor.
- Impor berkas `.xlsx` langsung.

### 8.2 Asumsi operasional

- Rate limit dan runner antrean dirancang untuk satu instance aplikasi (Docker Compose/VPS).
- Kanal Realtime privat membutuhkan "Allow public access" Realtime dimatikan di Supabase.

### 8.3 Keterbatasan yang diketahui

- Preferensi notifikasi di `/settings/profile` tersimpan tetapi belum memicu notifikasi apa pun (email maupun toast).
- Event webhook `batch.failed` dapat dipilih tetapi belum dikirim oleh sistem.
- Mode pencarian **SerpAPI** dapat dipilih, tetapi kunci SerpAPI belum dapat diisi dari `/settings/keys`.
- Kolom **Kategori WordPress** per baris di Tulis Terstruktur belum memengaruhi kategori yang dikirim ke WordPress.
