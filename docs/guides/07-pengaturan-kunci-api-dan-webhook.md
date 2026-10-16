# Pengaturan, Kunci API & Webhook

Menu **Pengaturan** ([/settings](/settings)) berisi tiga bagian: **Pusat Kunci API & Model AI (BYOK Hub)**, **Profil & Preferensi Akun**, dan **Integrasi Webhook & Automasi**.

---

## 1. Pusat Kunci API & Model AI (`/settings/keys`)

Panitera memakai sistem **BYOK** (*Bring Your Own Key*): semua panggilan AI dan layanan pihak ketiga memakai kunci milik akun Anda sendiri. Tidak ada kunci cadangan milik platform kecuali operator server Anda sengaja mengaktifkannya. Bila kunci OpenRouter belum disimpan, artikel gagal ditulis dengan pesan yang mengarahkan ke halaman ini.

### Bagian 1 — Provider Model AI (OpenRouter Gateway) — Wajib

- **OpenRouter**: tempel kunci (`sk-or-v1-…`). Tautan **Daftar / Buat Kunci** membuka halaman kunci OpenRouter.
- **Model Default Penulisan Artikel**: daftar model OpenRouter yang mendukung tool calling; Anda juga dapat mengetik ID model `provider/model`. Model ini dipakai untuk semua artikel (Tulis Cepat, antrean batch, Laboratorium) dengan preset bawaan maupun Agent Profile kustom, kecuali Agent Profile kustom yang membawa model sendiri.
- **Tingkat Penalaran (Reasoning Effort)**: **Ikuti Agent Profile** (bawaan; setiap preset memakai tingkatnya sendiri), **Low (Hemat & Cepat)**, **Medium (Seimbang)**, atau **High (Maksimal / Unlimited)**, untuk model yang mendukung penalaran. Low, Medium, atau High berlaku untuk semua Agent Profile, termasuk preset bawaan; makin tinggi, makin lambat dan makin banyak token terpakai.

### Bagian 2 — Mesin Pencari Web & Riset Fakta

- **Mode Pemilihan Mesin Pencari Utama**: bawaan **Auto Cascade** (mencoba kunci pribadi Anda lebih dulu, lalu cadangan tanpa kunci). Pilihan lain: Tavily, Brave, SerpAPI, SearXNG, Bing Web, atau Wikipedia.
- **Tavily Search**, **Brave Search**, dan **SerpAPI** (hasil Google): kunci opsional, masing-masing dengan tautan pendaftaran. Mode **SerpAPI** dan Auto Cascade memakai kunci SerpAPI yang tersimpan di sini; **Uji Kunci** SerpAPI memakai Account API sehingga tidak mengurangi kuota pencarian Anda.

### Bagian 3 — Penyedia Foto Bebas Royalti

- **Pexafy**: kunci opsional untuk foto berkualitas tinggi. Tanpa kunci, sistem tetap mencari foto dari sumber bebas royalti lain.

### Bagian 4 — Observabilitas & Tracing Agen (LangSmith)

- **LangSmith**: kunci opsional untuk memantau setiap langkah agen di akun LangSmith Anda sendiri.
- **Nama Proyek LangSmith**: bawaan `panitera`.

### Menyimpan, menguji, dan menghapus kunci

- Kunci yang tersimpan ditandai **Tersimpan terenkripsi**; kunci yang belum diisi ditandai **Belum diatur**. Nilai kunci tidak pernah ditampilkan kembali.
- Biarkan kolom kosong untuk mempertahankan kunci tersimpan, atau ketik kunci baru untuk menggantinya.
- **Uji Kunci** memeriksa kunci yang sedang diketik (untuk OpenRouter, kunci tersimpan diuji bila kolom kosong) dan menampilkan hasil beserta latensinya.
- Ikon tempat sampah menghapus kunci tersimpan setelah konfirmasi; fitur yang memakainya berhenti sampai kunci baru disimpan.
- Klik **Simpan Semua Pengaturan** untuk menyimpan. Perubahan berlaku untuk penulisan artikel berikutnya.

Semua kunci disimpan terenkripsi **AES-256-GCM** di server, hanya didekripsi saat memanggil API, dan tidak pernah dikirim ke browser atau disimpan di penyimpanan browser.

---

## 2. Profil & Preferensi Akun (`/settings/profile`)

- **Identitas**: **Email**, **User ID (Tenant)**, dan **Status Keamanan Database** akun Anda.
- **Keamanan Akun**: ganti kata sandi masuk Panitera (lihat di bawah).
- **Mode Pengembang (Developer Mode)**: sakelar **Laboratorium Pengujian Agen (/lab)** menampilkan menu Laboratorium untuk menguji tools dan Agent Profile (lihat [Agent Profile & Skill Registry](/docs?doc=03-manajemen-profil-agen)).

Klik **Simpan Preferensi** setelah mengubah sakelar. Pemberitahuan otomatis saat artikel atau batch selesai maupun gagal diatur lewat webhook (bagian 3).

### Mengganti kata sandi

1. Buka **Pengaturan → Profil & Preferensi Akun** ([/settings/profile](/settings/profile)), kartu **Keamanan Akun**.
2. Isi **Kata Sandi Saat Ini**.
3. Isi **Kata Sandi Baru** (minimal 6 karakter dan berbeda dari kata sandi saat ini), lalu ulangi di **Ulangi Kata Sandi Baru**.
4. Klik **Ganti Kata Sandi**.

Setelah berhasil, sesi di perangkat dan browser lain otomatis dikeluarkan, sedangkan sesi di browser ini tetap aktif. Bila kata sandi lama salah, muncul pesan **Kata sandi saat ini salah.** Demi keamanan, percobaan ganti kata sandi dibatasi (5 kali per 15 menit); bila terlampaui, tunggu sebentar lalu coba lagi.

---

## 3. Integrasi Webhook (`/settings/webhooks`)

Webhook mengirim HTTP POST otomatis ke layanan lain (Zapier, Make, n8n, Slack, Discord, atau server Anda sendiri) saat sesuatu terjadi di antrean.

### Menambah webhook

1. Klik **Tambah Webhook** (atau **Buat Webhook Pertama**).
2. Isi **Nama Webhook** dan **Payload URL**. Alamat harus publik (HTTPS di production); alamat lokal/privat ditolak.
3. Centang **Event yang Memicu Webhook**.
4. Opsional: **Secret Key Kustom** (minimal 16 karakter). Kosongkan agar dibuat otomatis.
5. Klik **Simpan & Aktifkan**. Dialog menampilkan **Secret Key** satu kali saja; salin dan simpan, lalu klik **Saya Sudah Menyimpan Secret Ini**.

### Event yang tersedia

| Event | Dipicu saat |
| :--- | :--- |
| `post.published` | Artikel tayang langsung di WordPress. |
| `post.scheduled` | Artikel berhasil dijadwalkan di WordPress. |
| `post.draft_saved` | Artikel tersimpan sebagai draf di WordPress. |
| `post.failed` | Artikel berhenti di **Gagal Tulis** atau **Gagal Kirim** (setelah coba ulang otomatis habis). |
| `batch.completed` | Semua artikel dalam satu batch selesai diproses dan minimal satu berhasil (sebagian boleh gagal). |
| `batch.failed` | Semua artikel dalam satu batch selesai diproses tetapi tidak ada satu pun yang berhasil. |

Setiap batch mengirim tepat satu dari dua event batch di atas, sekali saja, saat item terakhirnya selesai. Bila Anda menjalankan **Tulis ulang** atau **Kirim ulang** setelah batch selesai, event batch tidak dikirim lagi; hasil artikel yang diproses ulang dikabarkan lewat event `post.*`, dan status batch di dasbor ikut menyesuaikan (misalnya **Gagal** menjadi **Selesai** bila artikel yang dikirim ulang berhasil). Webhook baru otomatis mencentang kedua event batch; webhook lama yang hanya berlangganan `batch.completed` perlu mencentang `batch.failed` agar tetap mendapat kabar batch yang seluruhnya gagal.

Payload berupa JSON berisi `id`, `event`, `timestamp`, dan `data` (misalnya ID artikel, batch, kata kunci, judul, status, serta ID dan URL post WordPress). Event batch membawa `batchId`, `totalItems`, `completedItems` (jumlah berhasil), dan `failedItems` (jumlah gagal).

### Memverifikasi tanda tangan

Setiap pengiriman membawa header:

- `X-Panitera-Timestamp`: waktu kirim (detik Unix).
- `X-Panitera-Signature`: `sha256=` diikuti HMAC-SHA256 dari `timestamp.rawBody` dengan secret webhook.
- `X-Webhook-Event`: nama event.

Di server penerima, hitung ulang HMAC dari timestamp dan body mentah, bandingkan secara constant-time, dan tolak timestamp yang selisihnya lebih dari 5 menit. Pengiriman tidak diulang bila penerima gagal merespons, jadi pastikan endpoint Anda stabil.

### Mengelola webhook

Setiap kartu webhook memiliki sakelar aktif/nonaktif, tombol **Tes Ping** (mengirim event uji dan menampilkan kode HTTP serta latensi), tombol ubah (nama, URL, dan event; secret tidak dapat diganti), dan tombol hapus.
