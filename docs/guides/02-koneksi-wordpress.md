# Menghubungkan Website WordPress

Panitera terhubung ke website Anda lewat **WordPress REST API** bawaan core dan **Application Passwords** (tersedia sejak WordPress 5.6). Tidak ada plugin yang perlu dipasang.

---

## 1. Prasyarat Website

1. WordPress versi 5.6 atau lebih baru.
2. Memakai **HTTPS**. Server Panitera produksi menolak alamat `http://`, dan WordPress hanya mengaktifkan Application Passwords di koneksi aman.
3. Alamat dapat diakses publik. Alamat lokal/privat (`localhost`, `192.168.x.x`, `10.x.x.x`, dan sejenisnya) ditolak demi keamanan.
4. Permalink bukan **Plain** (`?p=123`); gunakan misalnya **Post name**. Panitera memanggil endpoint `/wp-json/`.
5. REST API tidak diblokir plugin keamanan (Wordfence, iThemes, dll.) atau aturan firewall/Cloudflare.
6. Akun WordPress yang dipakai berperan **Administrator** (wajib untuk membuat author lewat WP Tools) atau minimal **Editor**. Peran yang lebih rendah dapat ditolak WordPress saat menetapkan author, membuat tag atau kategori, dan menyisipkan tautan ke artikel lama.

---

## 2. Cara A — Otomatis (disarankan)

Cara ini tidak mengharuskan Anda menyalin password apa pun.

1. Buka **Daftar Website** ([/sites](/sites)) lalu klik **Sambungkan Website**.
2. Pada tab **Otomatis (disarankan)**, isi **Alamat website WordPress** (contoh: `https://blogku.com`). **Nama tampilan (opsional)** boleh dikosongkan; Panitera memakai judul website dari WordPress.
3. Klik **Hubungkan ke WordPress**. Panitera memeriksa REST API (**Memeriksa website…**), lalu membuka halaman otorisasi resmi WordPress.
4. Masuk ke wp-admin bila diminta, lalu tekan **Setujui** (**Approve**). WordPress membuat Application Password khusus Panitera.
5. Anda kembali ke `/sites` dengan banner **Website berhasil tersambung**.

Bila otorisasi gagal, banner menjelaskan penyebabnya (lihat [Pemecahan Masalah](/docs?doc=08-pemecahan-masalah)). Ulangi dari tombol **Sambungkan Website** atau gunakan cara manual.

---

## 3. Cara B — Input Manual (Application Password)

Gunakan cara ini bila otorisasi otomatis gagal atau WordPress Anda tidak menampilkan halaman persetujuan.

### Membuat Application Password di WordPress

1. Masuk ke wp-admin.
2. Buka **Users → Profile** (Pengguna → Profil).
3. Gulir ke bagian **Application Passwords**.
4. Isi nama aplikasi (misalnya `Panitera`), lalu klik **Add New Application Password**.
5. Salin kode 24 karakter yang muncul (contoh `abcd efgh ijkl mnop qrst uvwx`). Kode ini hanya tampil sekali.

Di formulir Panitera juga tersedia tautan **Buat Application Password di WordPress (tab baru)** yang langsung membuka halaman pembuatan password di website Anda (muncul setelah alamat website diisi).

### Mendaftarkan website

1. Pada dialog **Sambungkan Website**, pilih tab **Input Manual**.
2. Isi **Nama tampilan**, **Alamat website**, **Username WordPress**, dan **Application Password** (spasi di dalam password boleh dibiarkan).
3. Klik **Cek Koneksi** untuk menguji tanpa menyimpan. Bila berhasil muncul pesan **Koneksi berhasil! Terhubung sebagai pengguna …**.
4. Klik **Simpan Website**. Panitera memverifikasi ulang akses ke `/wp-json/wp/v2/users/me`, lalu menyimpan password dalam bentuk terenkripsi.

---

## 4. Status Koneksi & Cek Ulang

Setiap website memiliki badge status koneksi:

| Status | Arti | Tindakan |
| :--- | :--- | :--- |
| **Tersambung** | Kredensial valid; artikel bisa dikirim ke website ini. | — |
| **Kredensial ditolak** | WordPress menolak Application Password (dicabut, kedaluwarsa, atau username berubah). | Klik **Sambungkan ulang** untuk membuat kredensial baru. |
| **Dibatasi WordPress** | Hosting membatasi jumlah request dari Panitera (HTTP 429). | Tunggu 5–15 menit, lalu cek ulang koneksi. Bila sering terjadi, turunkan **Batas request paralel**. |
| **Tidak terjangkau** | Website tidak merespons (server mati, DNS/SSL bermasalah, timeout, atau diblokir firewall). | Periksa website, lalu cek ulang koneksi. |

- Status diperbarui otomatis setiap kali antrean mengirim artikel ke website, dan setiap kali Anda menekan **Cek ulang koneksi**.
- **Cek ulang koneksi** tersedia di header halaman kelola website dan di menu titik tiga tabel website. Panitera menguji Application Password tersimpan, menampilkan hasilnya, lalu memperbarui badge dan waktu **Terakhir dicek**. Hasil yang tidak menunjukkan kondisi koneksi (misalnya REST API mengembalikan 404) hanya ditampilkan sebagai pesan tanpa mengubah status.
- Bila status bukan **Tersambung**, tabel website menampilkan tautan **Cara memperbaiki** di bawah badge. Tautan ini membuka halaman kelola website yang berisi panel petunjuk sesuai statusnya.
- Website berstatus **Kredensial ditolak** disembunyikan dari pilihan website pada Tulis Cepat, Tulis Massal, Tulis Niche, Tulis Terstruktur, dan WP Tools sampai disambungkan ulang. Website berstatus **Dibatasi WordPress** atau **Tidak terjangkau** tetap dapat dipilih (statusnya ditampilkan di samping nama) karena kondisinya biasanya sementara. Artikel yang gagal terkirim selama gangguan dapat dikirim ulang dari halaman Antrean tanpa menulis ulang naskah.

### Memperbarui Application Password (Sambungkan ulang)

Bila status **Kredensial ditolak**, buka halaman kelola website, lalu klik **Sambungkan ulang** pada panel **Kredensial ditolak WordPress** dan setujui di WordPress. WordPress membuat Application Password baru yang menggantikan yang lama; antrean dan pengaturan website tetap. Setelah itu kirim ulang artikel yang gagal dari halaman [Antrean](/queue/items).

Cara ini berlaku untuk semua website, termasuk yang dulu ditambahkan lewat Input Manual: kredensial website yang sudah terdaftar hanya dapat diganti lewat alur otorisasi WordPress. Input manual untuk alamat yang sudah terdaftar ditolak dengan pesan **Website dengan alamat ini sudah terhubung ke akun Anda.**

Bila masih ditolak setelah menyambungkan ulang, pastikan akun WordPress-nya masih aktif dan hosting meneruskan header Authorization ke WordPress.

---

## 5. Mengelola Website

Tabel **Website Terhubung** di `/sites` menampilkan kolom **Website**, **Username WP**, **Status**, **Paralel maks.**, dan **Ditambahkan**. Tombol **Segarkan** memuat ulang daftar. Menu titik tiga di setiap baris berisi **Kelola website**, **Buka WP Admin**, **Cek ulang koneksi**, dan **Hapus website**.

Klik nama website untuk membuka halaman kelola (`/sites/[id]`):

- **Header**: badge status, tombol **Cek ulang koneksi**, dan **Buka WP Admin** (membuka dasbor WordPress di tab baru).
- **Panel petunjuk**: muncul bila status bukan **Tersambung**, berisi langkah pemulihan (dan tombol **Sambungkan ulang** untuk **Kredensial ditolak**).
- **Pengaturan Website**: ubah **Nama tampilan** dan **Batas request paralel** (1–10, bawaan 2), lalu klik **Simpan Pengaturan**. Batas ini adalah jumlah artikel yang boleh dikirim Panitera ke hosting Anda secara bersamaan; naikkan hanya bila hosting kuat.
- **Kategori WordPress** dan **Author WordPress**: daftar yang dibaca langsung dari website (maks. 100 kategori). Pembuatan dan saran AI ada di WP Tools lewat tautan **Kelola & sarankan kategori di WP Tools** dan **Tambah persona author di WP Tools**.
- **Koneksi**: alamat, username WordPress, keterangan bahwa Application Password tersimpan terenkripsi, **Terakhir dicek**, dan tanggal ditambahkan.
- **Hapus Website**: menghapus permanen semua batch dan antrean artikel website tersebut, termasuk naskah, log eksekusi, dan riwayat agen. Artikel yang sudah terkirim ke WordPress tidak ikut terhapus; cabut Application Password-nya di **WP Admin → Users → Profile** bila tidak dipakai lagi.

---

## 6. Keamanan Kredensial

- Application Password dienkripsi **AES-256-GCM** sebelum disimpan dan hanya didekripsi di server saat Panitera memanggil REST API website Anda.
- Password tidak pernah dikirim kembali ke browser; halaman hanya menampilkan keterangan **Tersimpan terenkripsi (AES-256-GCM)**.
- Setiap akun Panitera hanya dapat melihat dan memakai website miliknya sendiri.
