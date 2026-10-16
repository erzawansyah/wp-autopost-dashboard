# WP Tools

Menu **WP Tools** ([/tools](/tools)) berisi tiga asisten AI yang membaca dan menulis langsung ke website WordPress Anda lewat REST API: **Link Building**, **Author Creator**, dan **Kategori Creator**.

---

## 1. Sebelum Memakai WP Tools

- Hubungkan minimal satu website dengan status tersambung. Tanpa itu, halaman tool menampilkan **Belum ada website WordPress terhubung**.
- Pilih website target lewat pemilih website di pojok kanan atas halaman tool. Mengganti website atau meninggalkan halaman membatalkan analisis AI yang sedang berjalan.
- Asisten AI memakai kunci OpenRouter Anda (lihat [Pusat Kunci API](/settings/keys)). Bila terlalu sering dijalankan, tombol berubah menjadi **Tunggu N detik**.
- Akun WordPress yang terhubung perlu peran **Editor** atau **Administrator**; membuat author baru memerlukan **Administrator**.
- Dari halaman kelola website (`/sites/[id]`), tautan ke Kategori Creator dan Author Creator langsung memilih website tersebut.

---

## 2. Link Building (`/tools/link-building`)

Menyisipkan tautan internal dari artikel lama ke artikel baru Anda.

1. Isi **URL artikel baru** (artikel tujuan tautan). Opsional: **Kata kunci sasaran** dan **Instruksi tambahan**.
2. Klik **Riset & Temukan Artikel Lama**. AI merumuskan 3–4 kueri pencarian, mencari artikel terbit lama di WordPress, lalu memilih kalimat dan anchor text yang paling alami.
3. Setiap rekomendasi menampilkan **Alasan AI**, **Anchor text**, **Kalimat asli di naskah lama**, dan **Sesudah disisipi tautan**.
4. Klik **Sisipkan ke WordPress** lalu konfirmasi **Sisipkan Tautan**: artikel lama langsung diperbarui. Perubahan hanya bisa dibatalkan manual lewat editor/revisi WordPress.
5. Alternatifnya, klik **Salin HTML** untuk menyunting sendiri.

Demi keamanan, Panitera hanya menyisipkan tautan yang menuju URL artikel baru yang Anda analisis, dan hanya bila anchor text benar-benar ada di kalimat asli. Bila artikel lama sudah berubah sejak dianalisis atau rekomendasi ditolak, jalankan analisis ulang.

---

## 3. Author Creator (`/tools/authors`)

Membuat persona penulis yang kredibel sesuai prinsip E-E-A-T (*Experience, Expertise, Authoritativeness, Trustworthiness*). Panel kanan menampilkan **Author & Bio di WordPress** yang sudah ada.

### Tab Asisten AI Persona

1. Isi **Instruksi / arahan profil penulis**, atau klik salah satu **Contoh ide**.
2. Klik **Rancang Persona dengan AI**. AI membaca author yang sudah ada, lalu merancang 2–3 persona lengkap dengan keahlian, biografi, dan alasan kredibilitas.
3. Tinjau **Kandidat Persona Baru**, lalu klik **Setujui & Buat di WordPress** atau **Tolak** per persona. **Setujui semua (N)** membuat beberapa persona sekaligus setelah konfirmasi.
4. Persona yang disetujui didaftarkan sebagai user WordPress berperan **author**.

Persona yang emailnya kosong, tidak valid, atau tidak memakai domain website Anda diberi tanda **Perlu ditinjau**. Persona ini tidak ikut **Setujui semua** dan harus disetujui satu per satu, karena pemilik alamat email tersebut dapat mereset sandi dan masuk sebagai author.

### Tab Tambah Manual

Isi **Username**, **Peran** (Author, Editor, atau Contributor), **Nama tampilan**, **Alamat email**, dan **Biografi penulis (E-E-A-T)** (tersedia contoh biografi), lalu klik **Buat Author di WordPress**.

---

## 4. Kategori Creator (`/tools/categories`)

Merancang taksonomi kategori yang rapi dan tidak saling tumpang tindih. Panel kanan menampilkan **Kategori di WordPress** yang aktif.

### Tab Asisten AI

1. Isi **Instruksi / arahan topik kategori**, atau klik salah satu **Ide topik**.
2. Klik **Rancang Kategori dengan AI**. AI membaca kategori yang sudah ada lalu merancang 3–6 kategori baru beserta slug dan deskripsi SEO.
3. Tinjau **Rekomendasi Kategori Baru**, lalu klik **Setujui & Buat** atau **Tolak** per kategori, atau **Setujui semua (N)**.

### Tab Tambah Manual

- **Satu Kategori**: **Nama kategori**, **Slug (opsional)**, **Kategori induk**, dan **Deskripsi (opsional)**.
- **Masal (1 per baris)**: satu nama per baris, maksimal 50 kategori per pengiriman; nama ganda diabaikan.

Kategori yang dibuat di sini langsung dapat dipilih di Tulis Cepat dan Tulis Massal.
