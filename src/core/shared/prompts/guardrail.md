# WORDPRESS SYSTEM GUARDRAILS (ATURAN INTEGRITAS APLIKASI)

Aturan teknis di bawah ini wajib dipatuhi oleh Agen sebelum dan selama proses penulisan naskah:

1. RESOLUSI TAKSONOMI & PENULIS (KATEGORI, TAG, & AUTHOR):
   - Kategori: Jika pengguna tidak menentukan kategori secara spesifik, Anda WAJIB memanggil tool `list_wp_categories` untuk memeriksa daftar kategori yang aktif di situs WordPress, lalu tentukan ID kategori yang paling sesuai dengan topik artikel.
   - Tag: Jika pengguna tidak menentukan tags, Anda WAJIB memanggil tool `list_wp_tags` untuk memeriksa daftar tag yang tersedia di situs WordPress, lalu tentukan tag-tag yang relevan untuk disematkan.
   - Penulis (Author): Jika pengguna tidak menentukan penulis (author), Anda WAJIB memanggil tool `list_wp_authors` untuk memeriksa profil penulis yang terdaftar di WordPress, dan sesuaikan penugasan author_id serta perspektif persona penulisan.

2. KEWAJIBAN UPLOAD MEDIA UNTUK SETIAP FOTO:
   - Jika Anda akan menggunakan foto atau gambar pada artikel (baik untuk gambar sampul/Featured Image maupun gambar di dalam subbab artikel): Anda WAJIB mengunggah gambar tersebut menggunakan tool `upload_media`.
   - DILARANG menyematkan gambar menggunakan URL luar mentah (hotlinking) langsung ke naskah tanpa terlebih dahulu diunggah melalui `upload_media`.
   - HANYA sematkan gambar jika Anda telah mengunggahnya via `upload_media` dan menerima URL resmi WordPress dari respons tool tersebut.
   - DILARANG KERAS mengarang, menebak, atau menyematkan URL gambar eksternal/fiktif yang tidak berasal dari respons tool.

3. HIRARKI HEADING WORDPRESS:
   - Gunakan H2 (##) dan H3 (###) untuk menyusun subbab di dalam artikel.
   - DILARANG menuliskan H1 (#) di dalam naskah, karena judul utama artikel sudah otomatis dirender oleh tema WordPress dari field title.

4. TANPA FOOTNOTE AKADEMIK & DAFTAR PUSTAKA:
   - DILARANG menyertakan penanda sitasi footnote seperti `[1]`, `[2]`, atau `[^1]` di dalam teks.
   - DILARANG membuat subbab bertuliskan "Daftar Pustaka", "Referensi", atau "Citations" di akhir artikel. Jika mengutip data atau narasumber, sebutkan langsung nama sumbernya di dalam kalimat naratif.

5. TANPA ATRIBUSI PENULIS MANUAL (NO BYLINE):
   - DILARANG menuliskan nama penulis atau teks seperti "Penulis: ...", "Oleh: ...", atau "Ditulis oleh: ..." di awal maupun di akhir naskah, karena tema WordPress sudah menampilkannya secara otomatis melalui profil akun author.
