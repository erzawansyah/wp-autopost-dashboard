# Antrean, Status & Kirim Ulang

Semua artikel dari Tulis Cepat, Tulis Massal, Tulis Niche, dan Tulis Terstruktur masuk ke antrean yang tersimpan di database. Runner antrean di server mengambil artikel satu per satu, menulisnya dengan Agent Profile, lalu mengirimnya ke WordPress. Panduan ini menjelaskan cara memantau dan menangani artikel di antrean.

---

## 1. Halaman Antrean (`/queue/items`)

Menu **Antrean** menampilkan 100 artikel terbaru beserta statusnya.

- **Indikator pembaruan** di kiri atas: **Live** berarti status dikirim langsung dari server. **Pembaruan berkala** berarti koneksi langsung tidak tersedia, sehingga status diperiksa berkala (lebih jarang bila tidak ada perubahan). Tombol **Segarkan** memuat ulang data kapan saja.
- **Pencarian**: cari berdasarkan judul, topik, kategori, batch, atau domain.
- **Filter**: **Semua batch** (pilih satu batch atau grup Tulis Cepat), **Semua website**, dan tombol status **Semua**, **Dalam Proses**, **Terbit di Web**, **Draf di Web**, **Terjadwal**, **Gagal**.
- **Kelompokkan per batch**: menampilkan artikel per batch dengan progres **selesai/total**. Artikel Tulis Cepat dikelompokkan ke grup **Tulis Cepat (Quick Writer)**.
- Artikel **Tulis Niche** yang kata kuncinya belum disusun AI berjudul **Menunggu kata kunci dari AI** dengan topik **disusun AI**; kata kuncinya muncul begitu artikel pertama batch mulai diproses.
- **Kolom**: **Judul & Topik**, **Website Tujuan**, **Status**, **Waktu & Publikasi** (mis. **Rencana Tayang**, **Terjadwal di WP**, **Draf di WP**, **Terbit di Web**, atau **Gagal Diproses**), dan **Kategori**.
- **Aksi massal**: centang beberapa artikel untuk **Proses ulang N artikel** atau **Hapus N artikel**.

Menu titik tiga setiap baris berisi **Lihat detail & log**, **Buka di WordPress** (bila sudah terkirim), aksi ulang sesuai status, dan **Hapus dari daftar**.

Menu **Daftar Batch** (`/batches`) merangkum setiap batch: **Nama batch**, **Website target**, **Strategi jadwal**, **Kemajuan**, **Status** (**Berjalan**; **Selesai** bila semua artikel sudah diproses dan minimal satu berhasil; **Gagal** bila semua artikel gagal), dan tanggal dibuat. Dari sana Anda dapat membuka antrean batch atau menghapus batch.

---

## 2. Status Artikel

| Label di layar | Status sistem | Arti |
| :--- | :--- | :--- |
| **Menunggu** | `queued_input` | Tercatat di antrean, menunggu giliran atau jam tulisnya. |
| **Sedang Ditulis** | `generating_content` | Agent Profile sedang meriset dan menulis naskah. |
| **Siap Kirim** | `ready_to_sync` | Naskah selesai dan tersimpan, menunggu dikirim ke WordPress. |
| **Mengirim ke Web** | `syncing_to_wp` | Naskah sedang dikirim ke REST API WordPress. |
| **Sudah Terbit** | `published_on_wp` | Artikel tayang di WordPress. |
| **Dijadwalkan** | `scheduled_on_wp` | Artikel terjadwal di WordPress untuk tanggal mendatang. |
| **Tersimpan Draf** | `saved_draft_on_wp` | Artikel tersimpan sebagai draf di wp-admin. |
| **Gagal Tulis** | `failed_generation` | Penulisan AI gagal (mis. kunci API belum diisi, kuota habis, atau batas agen tercapai). |
| **Gagal Kirim** | `failed_sync` | Pengiriman ke WordPress gagal atau hasilnya tidak pasti. |

---

## 3. Coba Ulang Otomatis

Gangguan sementara (model AI sibuk, batas permintaan, server WordPress 503, jaringan putus sebelum terkirim) dicoba ulang otomatis dengan jeda 1 menit lalu 5 menit, maksimal 3 percobaan. Selama menunggu, artikel kembali berstatus **Menunggu** atau **Siap Kirim**, dan halaman detail menampilkan waktu percobaan berikutnya. Setelah percobaan habis, atau bila kegagalan bersifat permanen (kredensial ditolak, kunci API tidak valid), artikel berhenti di **Gagal Tulis** atau **Gagal Kirim** dengan pesan kendala terakhir.

Artikel yang tertahan karena server berhenti di tengah proses dipulihkan otomatis setelah masa klaimnya habis.

---

## 4. Aksi Ulang Manual

Tombol aksi muncul di baris antrean, menu titik tiga, dan halaman detail artikel, sesuai status:

| Status | Tombol | Yang terjadi |
| :--- | :--- | :--- |
| **Menunggu** | **Jalankan sekarang** | Artikel diproses sekarang tanpa menunggu jadwal tayang. |
| **Gagal Tulis** | **Tulis ulang** | Artikel kembali ke antrean penulisan. Draf tersimpan yang masih valid dipakai ulang tanpa biaya AI; artikel ditulis baru hanya bila input atau Agent Profile berubah. |
| **Gagal Kirim** atau **Siap Kirim** | **Kirim ulang ke WordPress** | Naskah tersimpan dikirim ulang tanpa menulis ulang (tanpa biaya AI). |

**Kirim ulang hemat biaya**: kegagalan pengiriman tidak pernah memicu penulisan AI ulang. Naskah yang sudah jadi disimpan di database dan hanya dikirim ulang ke WordPress.

**Cegah posting ganda**: bila pengiriman terputus karena timeout atau error server WordPress (5xx), artikel mungkin sudah tersimpan di WordPress walaupun Panitera menerima error. Artikel seperti ini tidak dikirim ulang otomatis. Periksa wp-admin lebih dulu; kirim ulang hanya bila artikel belum ada. Bila Panitera sudah mencatat ID post WordPress untuk artikel tersebut, kirim ulang ditolak dengan pesan **Artikel ini sudah tercatat di WordPress (WP ID #…)**.

---

## 5. Detail Artikel (`/posts/[id]`)

Klik judul artikel (atau **Lihat detail & log**) untuk membuka detailnya:

- **Header**: judul, topik, website, indikator **Live**, tombol **Segarkan**, aksi ulang sesuai status, dan **Buka di WordPress** bila sudah terkirim.
- **Status pengerjaan**: empat tahap **Masuk Antrean**, **Penulisan**, **Kirim WordPress**, **Selesai**, beserta **Kendala eksekusi** terakhir bila ada.
- **Ringkasan run**: **Biaya (USD)**, **Total token**, **Panggilan LLM**, dan **Percobaan**, serta rincian run terakhir (Agent Profile, model, durasi, alasan berhenti, jumlah kata) dan checkpoint yang tersimpan.
- Tab **Log aktivitas**: setiap langkah agen beserta input dan output JSON-nya.
- Tab **Naskah artikel**: judul, kategori, tag, ringkasan, lalu **Baca naskah** atau **Kode Gutenberg** (dengan tombol salin) dan **Instruksi khusus** bila ada.

---

## 6. Menghapus Artikel atau Batch

- **Hapus dari daftar** (per artikel), **Hapus N artikel** (massal), atau hapus batch dari Antrean maupun Daftar Batch. Menghapus grup Tulis Cepat menghapus seluruh riwayat Tulis Cepat.
- Penghapusan hanya berlaku di Panitera (artikel, log, dan metrik run). Post yang sudah ada di WordPress tidak ikut terhapus.
