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

1. Di Panitera, buka menu **Website** (`/sites`).
2. Klik tombol **Tambah Website**.
3. Isi formulir pendaftaran:
   - **Nama Situs**: Nama pengenal bebas untuk dasbor Anda (misal: *Blog Teknologi*).
   - **URL Situs**: Alamat lengkap WordPress Anda (contoh: `https://domainanda.com`).
   - **Username**: Username akun admin/editor WordPress Anda.
   - **Application Password**: Tempel sandi aplikasi 24 karakter yang baru dibuat tadi (spasi boleh dibiarkan).
4. Klik **Simpan & Uji Koneksi**.
5. Sistem akan melakukan ping ke `/wp-json/wp/v2/users/me` untuk memverifikasi hak akses. Jika valid, status situs akan menjadi **Terkoneksi**.

---

## 4. Keamanan Kredensial

- Seluruh kredensial Application Password dienkripsi menggunakan algoritma **AES-256-GCM** sebelum disimpan ke database.
- Kredensial hanya didekripsi sesaat di memori server ketika melakukan pemanggilan HTTP ke WordPress REST API Anda, dan tidak pernah dikembalikan ke antarmuka browser.
