# Memulai Panitera

**Panitera** adalah dasbor penerbitan konten untuk banyak website WordPress sekaligus. Anda menghubungkan website, memilih **Agent Profile** (agen penulis AI), lalu Panitera menulis artikel di latar belakang dan mengirimkannya ke WordPress sebagai draf, langsung terbit, atau terjadwal.

---

## 1. Konsep Utama

- **Tanpa plugin**: Panitera hanya memakai REST API bawaan WordPress dan **Application Passwords**. Tidak ada plugin atau berkas PHP yang perlu dipasang di website Anda.
- **Bawa kunci API sendiri (BYOK)**: penulisan AI memakai kunci OpenRouter milik Anda. Biaya dan kuota sepenuhnya ada di akun Anda; tanpa kunci tersimpan, artikel gagal ditulis.
- **Antrean berbasis database**: setiap artikel dicatat di antrean sebelum diproses, jadi halaman boleh ditutup. Status diperbarui langsung di layar, dan artikel yang gagal terkirim dapat dikirim ulang tanpa ditulis ulang.
- **Agent Profile**: resep agen penulis — mode Standard atau Deep, tools riset yang diizinkan, instruksi alur kerja, dan batas eksekusi.

---

## 2. Langkah Awal

1. **Daftar atau masuk** di halaman `/login` (tab **Masuk** atau **Daftar Baru**).
2. **Simpan kunci OpenRouter**: buka **Pengaturan → Pusat Kunci API & Model AI** ([/settings/keys](/settings/keys)), isi kunci OpenRouter, pilih **Model Default Penulisan Artikel**, lalu klik **Simpan Semua Pengaturan**.
3. **Hubungkan website**: buka **Daftar Website** ([/sites](/sites)), klik **Sambungkan Website**, lalu ikuti tab **Otomatis (disarankan)**.
4. **Tulis artikel pertama**: buka **Tulis Cepat** ([/posts/new](/posts/new)), isi topik, biarkan status **Simpan Draf**, lalu klik **Tulis & simpan ke draf**.
5. **Pantau hasilnya** di Dashboard atau menu **Antrean** sampai status menjadi **Tersimpan Draf**, lalu tinjau drafnya di wp-admin.

Rincian tiap langkah ada di [Pengaturan, Kunci API & Webhook](/docs?doc=07-pengaturan-kunci-api-dan-webhook) dan [Menghubungkan Website WordPress](/docs?doc=02-koneksi-wordpress).

---

## 3. Peta Menu

Sidebar kiri dibagi menjadi tiga kelompok.

| Kelompok | Menu | Fungsi |
| :--- | :--- | :--- |
| Menu Utama | **Dashboard** | Ringkasan antrean, website terhubung, pintasan, dan artikel terbaru. |
| Menu Utama | **Daftar Website** | Menyambungkan website WordPress, memantau status koneksinya, dan mengelola pengaturannya. |
| Menu Utama | **Daftar Batch** | Riwayat batch beserta progres dan website tujuannya. |
| Menu Utama | **Antrean** | Status setiap artikel, jadwal tayang, dan aksi kirim ulang. |
| Penerbitan Konten | **Tulis Cepat** | Satu artikel dari satu topik. |
| Penerbitan Konten | **Tulis Massal** | Banyak kata kunci sekaligus (maks. 50 per batch), langsung atau bertahap. |
| Penerbitan Konten | **Tulis Niche** | Banyak artikel dari satu niche (maks. 50 per batch); kata kuncinya disusun AI. |
| Penerbitan Konten | **Tulis Terstruktur** | Impor data tabel (CSV/TSV/tempel dari spreadsheet) dengan kolom judul, LSI, fokus, dan tag. |
| Alat & Konfigurasi | **WP Tools** | Asisten AI untuk tautan internal, persona author, dan kategori. |
| Alat & Konfigurasi | **Profil Agen** | Membuat dan mengatur Agent Profile. |
| Alat & Konfigurasi | **Skill Registry** | Berkas keahlian `SKILL.md` untuk Agent Profile mode Deep. |
| Alat & Konfigurasi | **Laboratorium** | Uji tools dan Agent Profile; hanya tampil bila Developer Mode aktif. |
| Alat & Konfigurasi | **Pengaturan** | Kunci API, profil & keamanan akun (ganti kata sandi), preferensi, dan webhook. |
| Alat & Konfigurasi | **Help / Docs** | Panduan ini. |

Di pojok kanan atas tersedia tombol tema (mode terang/gelap) dan menu akun (lingkaran inisial email) berisi **Kelola Website** dan **Keluar**. Sidebar dapat diciutkan lewat tombol di samping logo.

---

## 4. Dashboard

Halaman **Ruang Kerja Penerbitan** (`/`) menampilkan:

- Empat kartu ringkasan: **Sudah Terbit**, **Sedang Diproses**, **Draf & Terjadwal**, dan **Perlu Tindakan** (artikel gagal yang bisa dicoba ulang).
- Panel **Website Terhubung** (website yang bermasalah ditandai badge status koneksinya) dan **Mulai Bekerja** (pintasan ke menu penulisan, Antrean, WP Tools, dan Profil Agen).
- Tabel **Artikel Terbaru** yang statusnya ikut diperbarui otomatis.

Setelah mengirim Tulis Cepat, Anda diarahkan ke Dashboard dengan banner **Artikel masuk antrean** dan tombol **Pantau log eksekusi**.

---

## 5. Panduan Lainnya

- [Menghubungkan Website WordPress](/docs?doc=02-koneksi-wordpress)
- [Agent Profile & Skill Registry](/docs?doc=03-manajemen-profil-agen)
- [Tulis Cepat, Tulis Massal, Tulis Niche & Penjadwalan](/docs?doc=04-penerbitan-dan-penjadwalan)
- [WP Tools](/docs?doc=05-wp-tools-dan-utilitas)
- [Antrean, Status & Kirim Ulang](/docs?doc=06-antrean-dan-status-artikel)
- [Pengaturan, Kunci API & Webhook](/docs?doc=07-pengaturan-kunci-api-dan-webhook)
- [Pemecahan Masalah](/docs?doc=08-pemecahan-masalah)
