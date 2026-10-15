# Menghubungkan WordPress (Zero-Plugin Connection)

Panitera menggunakan standar resmi **WordPress REST API** bawaan WordPress core (sejak versi 4.7) dan fitur autentikasi **Application Passwords** (sejak versi 5.6). Anda tidak perlu memasang plugin custom apa pun di website Anda.

---

## 1. Prasyarat Website

1. Versi WordPress minimal 5.6 atau lebih baru.
2. Menggunakan protokol **HTTPS** (Application Passwords memerlukan koneksi aman SSL/TLS).
3. Struktur permalink WordPress aktif (bukan *Plain* / `?p=123`). Gunakan struktur seperti *Post name* (`/%postname%/`).
4. REST API aktif (tidak diblokir oleh plugin keamanan seperti Wordfence/iThemes atau aturan Cloudflare WAF).

---

## 2. Cara Membuat Application Password di WordPress

1. Masuk ke dasbor admin WordPress Anda (`wp-admin`).
2. Masuk ke menu **Users (Pengguna)** ➔ **Profile (Profil)**.
3. Gulir ke bawah hingga menemukan bagian **Application Passwords (Sandi Aplikasi)**.
4. Pada kolom *New Application Password Name*, ketikkan nama pengenal, misalnya: `Panitera Publishing`.
5. Klik tombol **Add New Application Password**.
6. WordPress akan menghasilkan sandi acak format 24 karakter (contoh: `abcd efgh ijkl mnop qrst uvwx`).
7. Salin sandi tersebut. (Sandi ini hanya ditampilkan satu kali).

---

## 3. Mendaftarkan Situs di Panitera

Buka menu **Daftar Website** (`/sites`) lalu klik **Sambungkan Website**. Tersedia dua cara:

### A. Otomatis (disarankan) — tanpa menyalin password
1. Isi **Alamat website WordPress** (contoh: `https://domainanda.com`). **Nama tampilan** boleh dikosongkan (diambil dari judul website).
2. Klik **Hubungkan ke WordPress**. Panitera memeriksa REST API, lalu membuka halaman otorisasi resmi WordPress.
3. Tekan **Setujui / Approve**. WordPress membuat Application Password khusus Panitera dan mengembalikan Anda ke `/sites`.
4. Banner di atas daftar menjelaskan hasilnya. Bila otorisasi gagal (misalnya token kedaluwarsa, sesi login berakhir, atau WordPress tidak mengirim kredensial), ulangi dari tombol **Sambungkan Website** atau gunakan cara manual.

### B. Input Manual (Application Password)
1. Buat Application Password seperti langkah bagian 2 (atau klik tautan **Buat Application Password di WordPress** di formulir).
2. Isi **Nama tampilan**, **Alamat website**, **Username WordPress**, dan **Application Password** (spasi boleh dibiarkan).
3. Klik **Cek Koneksi** untuk menguji tanpa menyimpan, lalu **Simpan Website**. Sistem memverifikasi akses ke `/wp-json/wp/v2/users/me`; bila valid, status situs menjadi **Tersambung**.

### C. Kelola Website
Klik nama website di daftar untuk membuka halaman kelola (`/sites/[id]`):
- **Pengaturan Website**: ubah nama tampilan dan **Batas request paralel** (1–10, bawaan 2) — jumlah artikel yang dikirim bersamaan ke hosting Anda. Naikkan hanya bila hosting kuat.
- **Kategori & Author WordPress**: daftar yang dibaca langsung dari website; pembuatan dan saran AI ada di **WP Tools**.
- **Hapus Website**: menghapus permanen semua batch dan antrean artikel website tersebut (beserta naskah dan log) dari Panitera. Artikel yang sudah terkirim ke WordPress tidak terhapus; cabut Application Password-nya di wp-admin bila tidak dipakai lagi.

---

## 4. Keamanan Kredensial

- Seluruh kredensial Application Password dienkripsi menggunakan algoritma **AES-256-GCM** sebelum disimpan ke database.
- Kredensial hanya didekripsi sesaat di memori server ketika melakukan pemanggilan HTTP ke WordPress REST API Anda, dan tidak pernah dikembalikan ke antarmuka browser.
