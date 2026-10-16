# Pemecahan Masalah

Kumpulan masalah yang paling sering muncul beserta penyebab dan langkah penyelesaiannya.

---

## 1. Artikel Berstatus Gagal Tulis

**Pesan "API Key OpenRouter belum dikonfigurasi"**: Panitera memakai sistem BYOK, jadi setiap akun wajib menyimpan kunci OpenRouter sendiri. Simpan kunci di [Pusat Kunci API & Model AI](/settings/keys), lalu klik **Tulis ulang** pada artikel tersebut.

**Kuota atau saldo OpenRouter habis, kunci tidak valid, atau model tidak tersedia**: periksa akun OpenRouter Anda atau ganti **Model Default Penulisan Artikel**, lalu **Tulis ulang**.

**Batas agen tercapai atau naskah terlalu pendek**: buka detail artikel, lihat **Alasan berhenti** di ringkasan run dan tab **Log aktivitas**. Naikkan **Batas waktu**, **Maks. panggilan model/tool**, atau sesuaikan **Target minimal kata** di Agent Profile.

**Tulis ulang** memakai ulang draf tersimpan yang masih valid tanpa biaya AI; artikel ditulis baru hanya bila input atau Agent Profile berubah.

---

## 2. Artikel Berstatus Gagal Kirim

1. Buka wp-admin dan pastikan artikel belum ada di sana. Timeout atau error server WordPress (5xx) bisa terjadi setelah WordPress menyimpan post.
2. Bila belum ada, klik **Kirim ulang ke WordPress**. Naskah tersimpan dikirim tanpa menulis ulang dan tanpa biaya AI.
3. Bila kegagalan berulang, lihat badge status website di **Daftar Website**. Status ikut diperbarui setiap kali antrean mengirim artikel: **Kredensial ditolak** (klik **Sambungkan ulang** di halaman kelola website), **Dibatasi WordPress** (tunggu lalu turunkan **Batas request paralel**), atau **Tidak terjangkau** (periksa website, SSL, dan firewall). Klik **Cek ulang koneksi** setelah masalah diperbaiki. Lihat [Status Koneksi & Cek Ulang](/docs?doc=02-koneksi-wordpress).

Pesan **Artikel ini sudah tercatat di WordPress (WP ID #…)** berarti post sudah dibuat; periksa langsung di wp-admin dan jangan kirim ulang.

---

## 3. Gagal Menghubungkan Website

### Banner setelah otorisasi otomatis

| Banner | Penyebab & tindakan |
| :--- | :--- |
| **Otorisasi dibatalkan di WordPress** | Permintaan ditolak di halaman WordPress. Ulangi lalu tekan **Setujui**. |
| **Sesi otorisasi kedaluwarsa** | Token otorisasi kedaluwarsa atau tidak valid. Mulai ulang dari **Sambungkan Website**. |
| **Token otorisasi Panitera tidak ikut kembali** | WordPress kembali tanpa token keamanan Panitera. Ulangi, atau gunakan tab **Input Manual**. |
| **Akun Panitera tidak cocok** | Otorisasi dimulai dari akun Panitera lain. Masuk dengan akun yang benar lalu ulangi. |
| **Sesi login berakhir** | Sesi Panitera habis sebelum otorisasi selesai. Masuk kembali lalu ulangi. |
| **WordPress tidak mengirim kredensial** | WordPress tidak mengembalikan username dan Application Password. Gunakan **Input Manual**. |
| **Kredensial dari WordPress ditolak** | Kredensial gagal diverifikasi; detail penyebab ditampilkan di banner. Ulangi dari **Sambungkan Website**. |
| **Website gagal disimpan** atau **Website belum dapat disimpan** | Gangguan penyimpanan atau konfigurasi server Panitera. Coba lagi nanti atau hubungi admin platform. |

### Pesan saat memeriksa website

- **Website WordPress produksi wajib menggunakan HTTPS.**: gunakan alamat `https://`.
- **Akses ke IP privat/lokal dilarang demi keamanan sistem.**: alamat harus dapat diakses publik.
- **REST API WordPress tidak merespons dengan benar (HTTP …)** (mode Otomatis) atau **Endpoint REST API tidak ditemukan (404)** (Input Manual): aktifkan permalink selain **Plain** dan pastikan `/wp-json/` tidak diblokir.
- **Kredensial ditolak (HTTP 401/403)**: periksa username dan Application Password (input manual), atau pastikan plugin keamanan dan hosting tidak memblokir header Authorization ke REST API.
- **WordPress atau hosting membatasi jumlah request (HTTP 429)**: tunggu beberapa menit lalu coba lagi.
- **Koneksi ke website timeout** atau **Koneksi ke website WordPress timeout**: website lambat atau tidak dapat dijangkau; coba lagi beberapa saat kemudian.
- **Website dengan alamat ini sudah terhubung ke akun Anda.**: website sudah terdaftar. Untuk memperbarui kredensialnya, gunakan **Sambungkan ulang** (lihat [panduan koneksi](/docs?doc=02-koneksi-wordpress)).

### Website tidak muncul di pilihan formulir

Website berstatus **Kredensial ditolak** disembunyikan dari pilihan **Website WordPress target** pada formulir penulisan maupun WP Tools, karena WordPress pasti menolak kirimannya sampai kredensial diperbarui. Buka **Daftar Website**, klik **Cara memperbaiki** di bawah badge status, lalu klik **Sambungkan ulang** pada panel petunjuknya. Website berstatus **Dibatasi WordPress** atau **Tidak terjangkau** tetap muncul (dengan label statusnya) karena kondisinya biasanya sementara.

---

## 4. Artikel Tertahan di Status Menunggu

- Batch dengan eksekusi **Bertahap** baru ditulis sekitar 10 menit sebelum jam tayang masing-masing. Lihat kolom **Waktu & Publikasi**.
- Artikel yang sedang menunggu coba ulang otomatis menampilkan waktu percobaan berikutnya di halaman detail.
- Klik **Jalankan sekarang** untuk memproses artikel tanpa menunggu jadwal.
- Bila indikator menampilkan **Pembaruan berkala**, status diperiksa berkala; klik **Segarkan** untuk memuat data terbaru.

---

## 5. Pesan "Terlalu banyak permintaan"

Panitera membatasi permintaan per akun per menit: 30 untuk membuat atau menjadwalkan ulang antrean, 20 untuk panggilan AI interaktif (WP Tools, Laboratorium, uji kunci OpenRouter), dan 15 untuk uji koneksi keluar (cek ulang koneksi website, kunci pencarian, webhook, daftar model). Ganti kata sandi dibatasi 5 kali per 15 menit. Tunggu sesuai waktu yang disebut pesan, lalu ulangi. Pada aksi massal **Proses ulang**, artikel yang belum sempat dijadwalkan dapat diulang setelah jeda.

---

## 6. Tulis Terstruktur Membaca Kolom dengan Salah

- Lihat **Pemisah terdeteksi** di panel **Pemetaan kolom otomatis**. Panel ini hanya muncul bila data terbaca lebih dari satu kolom.
- Pemisah dipilih dari karakter yang paling dominan (tab, garis tegak, titik koma, atau koma). Hindari memakai karakter pemisah kolom di dalam sel; tempelan langsung dari spreadsheet (tab) paling aman.
- Klik **Lihat pratinjau data** untuk memastikan kata kunci, judul, LSI, dan fokus setiap baris sudah benar sebelum mengirim.

---

## 7. WP Tools

- **Tautan rekomendasi tidak menuju artikel baru yang dianalisis** atau **Teks anchor rekomendasi tidak ditemukan di dalam kalimat asli**: jalankan analisis ulang.
- **Kalimat asli tidak ditemukan persis di dalam naskah WordPress**: artikel lama sudah diubah sejak dianalisis; jalankan analisis ulang.
- **Kalimat tersebut sudah berada di dalam tautan**: tidak perlu disisipkan lagi.
- Gagal membuat author: akun WordPress yang terhubung harus berperan Administrator. Persona bertanda **Perlu ditinjau** harus disetujui satu per satu.
- Kategori artikel tidak sesuai harapan: AI hanya memilih dari kategori yang sudah ada. Buat kategori lebih dulu di **Kategori Creator**, lalu pilih di formulir penulisan.

---

## 8. Menu Laboratorium Tidak Terlihat

Laboratorium hanya tersedia dengan **Developer Mode**. Aktifkan sakelar **Laboratorium Pengujian Agen (/lab)** di **Pengaturan → Profil & Preferensi Akun**, lalu klik **Simpan Preferensi**.
