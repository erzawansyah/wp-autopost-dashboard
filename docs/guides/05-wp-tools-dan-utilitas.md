# Utilitas AI WordPress (WP Tools)

Menu **WP Tools** (`/tools`) menghadirkan serangkaian asisten bertenaga AI yang menginspeksi website WordPress Anda secara langsung melalui REST API untuk memperkuat struktur SEO dan kredibilitas E-E-A-T.

---

## 1. Internal Link Building Retroaktif (`/tools/link-building`)

Membangun struktur tautan internal (*internal links*) secara manual antar postingan lama dan baru seringkali memakan waktu lama.

### Cara Kerja:
1. Masukkan URL artikel baru yang ingin Anda beri suntikan *backlink* internal.
2. AI membedah topik artikel baru dan mencari postingan lama yang relevan di WordPress Anda.
3. AI membaca konten postingan lama dan mengidentifikasi konteks kalimat terbaik untuk disisipkan *anchor text* alami.
4. Anda dapat menyetujui rekomendasi penyisipan:
   - **Terapkan Otomatis**: Panitera langsung memperbarui konten artikel lama di WordPress via REST API.
   - **Salin Manual**: Salin kalimat yang direkomendasikan untuk diedit manual.
5. Demi keamanan, Panitera hanya menyisipkan tautan yang menuju URL artikel baru yang Anda analisis. Rekomendasi yang mengarah ke alamat lain ditolak — jalankan analisis ulang bila itu terjadi.

---

## 2. Pembuat Persona Penulis E-E-A-T (`/tools/authors`)

Google Search Quality Rater Guidelines menitikberatkan pada faktor *Experience, Expertise, Authoritativeness, and Trustworthiness* (E-E-A-T).

### Cara Kerja:
1. Pilih website target dan tentukan tema atau niche situs Anda.
2. AI membaca author yang sudah menerbitkan artikel dan merancang 2–3 profil persona author profesional lengkap dengan latar belakang keahlian dan biografi persuasif.
3. Anda dapat menyetujui persona yang cocok. Panitera akan mendaftarkan akun author baru tersebut ke WordPress dengan role `author` secara otomatis (role editor/contributor hanya lewat tab Manual).
4. Persona yang emailnya kosong, tidak valid, atau tidak memakai domain website Anda diberi tanda **Perlu ditinjau**. Persona ini tidak ikut "Setujui semua" dan harus disetujui satu per satu — pemilik email dapat mereset sandi akun tersebut, jadi setujui hanya alamat yang Anda kenal.

---

## 3. Perancang Taksonomi Kategori (`/tools/categories`)

Struktur kategori yang berantakan atau saling tumpang tindih (*cannibalization*) dapat menurunkan performa SEO situs.

### Cara Kerja:
1. Masukkan topik utama atau tujuan konten website Anda.
2. AI menganalisis kategori aktif di WordPress Anda untuk mendeteksi celah topik.
3. AI merancang struktur 3–6 kategori baru yang non-overlapping, lengkap dengan slug ramah SEO dan deskripsi kategori.
4. Anda dapat memilih kategori yang disetujui dan menerbitkannya secara masal (*bulk publish*) langsung ke WordPress Anda.
