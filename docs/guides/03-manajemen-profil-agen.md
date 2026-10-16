# Agent Profile & Skill Registry

Setiap artikel ditulis oleh sebuah **Agent Profile**: resep agen penulis yang menentukan mode agen, tools riset yang boleh dipakai, instruksi alur kerja, dan batas eksekusi. Agent Profile dipilih di Tulis Cepat, Tulis Massal, dan Tulis Terstruktur.

---

## 1. Preset Bawaan

Menu **Profil Agen** ([/agents](/agents)) menampilkan **Preset Bawaan Sistem** yang siap pakai dan baca-saja:

| Preset | Mode | Tools | Cocok untuk |
| :--- | :--- | :--- | :--- |
| **Quick Writer** | Standard | Tanpa tools | Artikel instan, hemat token. Default bila Anda belum menetapkan profil default. |
| **Research & Media Writer** | Standard | 6 Universal Tools | Artikel berbasis riset web dengan foto pilihan. |
| **Deep Research Specialist** | Deep | 6 Universal Tools + skill `anti-ai-editor` | Artikel investigatif dengan perencanaan bertahap. |

Untuk menyesuaikan preset, klik **Kloning & Modifikasi** pada kartunya; salinannya menjadi Agent Profile kustom yang bisa diedit. Profil kustom tampil di bagian **Agent Profile Kustom Anda** dengan tombol **Edit** dan hapus.

---

## 2. Membuat atau Mengedit Agent Profile

Klik **Buat Profil Agen Baru** (atau **Edit** pada profil kustom). Formulir terdiri dari:

- **Identitas Agen**: **Nama profil agen**, **Deskripsi singkat**, mode (**Standard** atau **Deep Agent**), dan **Jadikan default** (otomatis dipilih di Tulis Cepat & Tulis Massal).
- **Alur Kerja Penulisan (Workflow Prompt)**: instruksi langkah demi langkah cara agen meriset dan menyusun artikel. Tab **Raw** untuk mengedit dan **Pratinjau** untuk membaca; tombol **Sisipkan ke kursor** membantu menyebut nama tool. Sebut tool secara eksplisit, misalnya "Gunakan `web_search` untuk…".
- **Universal Tools**: centang tools yang diizinkan (lihat bagian 3).
- **Skill Registry** (hanya mode Deep): centang skill `SKILL.md` yang dimuat agen.
- **Parameter & Batas Runtime**: **Temperatur kreativitas**, **Maks. panggilan model**, **Maks. panggilan tool**, **Batas waktu (detik)**, dan **Target minimal kata**. Nilai di luar rentang otomatis disesuaikan ke batas sistem.

Klik **Simpan Profil Agen** (profil baru) atau **Simpan Perubahan Profil**. Menghapus profil kustom mengarsipkannya: profil tidak muncul lagi di pilihan, tetapi antrean lama yang memakainya tetap dapat diproses.

### Mode Standard vs Deep

- **Standard**: agen ReAct yang cepat dan hemat token; cocok untuk sebagian besar artikel.
- **Deep Agent**: agen dengan perencanaan tugas yang dapat membaca skill `SKILL.md` dari Skill Registry. Lebih lama dan lebih mahal, cocok untuk topik yang butuh riset mendalam.

### Model AI

Editor Agent Profile tidak memiliki pilihan model. Artikel (Tulis Cepat, antrean batch, dan Laboratorium) ditulis dengan **Model Default Penulisan Artikel** yang Anda atur di [Pusat Kunci API & Model AI](/settings/keys), baik dengan preset bawaan maupun Agent Profile kustom. Pengecualian: Agent Profile kustom yang membawa model sendiri (diisi lewat API) selalu memakai model tersebut. Bila model default belum dipilih, dipakai model bawaan sistem.

**Tingkat Penalaran** di halaman yang sama berlaku untuk Agent Profile kustom; preset bawaan memakai tingkat penalarannya sendiri (Quick Writer dan Research & Media Writer: Low, Deep Research Specialist: Medium).

---

## 3. Universal Tools

| Tool (label di formulir) | ID di workflow prompt | Fungsi |
| :--- | :--- | :--- |
| **Keyword & LSI Suggestions** | `keyword_suggestions` | Saran kata kunci turunan dan LSI untuk menyusun subjudul. |
| **Web Search** | `web_search` | Mencari referensi dan data terbaru di web. |
| **Web Reader** | `web_reader` | Membaca isi lengkap halaman web rujukan. |
| **Image Search** | `image_search` | Mencari foto landscape bebas royalti (lebar minimal 1280 px). |
| **Set Featured Image** | `set_featured_image` | Memilih gambar sampul (featured image) artikel. |
| **Upload Media to WordPress** | `upload_media` | Mengunggah foto ke Media Library WordPress; butuh website terhubung. |

`web_search` mengikuti **Mode Pemilihan Mesin Pencari Utama** di Pusat Kunci API. Mode bawaan **Auto Cascade** mencoba kunci Tavily atau Brave Anda lebih dulu, lalu SearXNG dan sumber terbuka sebagai cadangan. `image_search` memakai kunci Pexafy Anda bila tersedia, lalu sumber foto bebas royalti lain. Setiap tool di formulir diberi tanda **Siap** atau **Perlu konfigurasi** (arahkan kursor untuk melihat syaratnya).

---

## 4. Yang Terjadi Saat Agen Menulis

1. **Pre-Flight Resolver**: sebelum menulis, Panitera membaca author, kategori, dan tag dari WordPress target. Sistem memilih persona author yang sesuai (akun admin teknis tidak dipilih selama ada persona lain), memakai kategori pilihan Anda atau memilihkan dari kategori yang sudah ada, dan mencocokkan atau membuat tag. Kategori baru tidak dibuat otomatis; buat lewat [WP Tools](/docs?doc=05-wp-tools-dan-utilitas).
2. **Penulisan**: agen menulis naskah Markdown dengan tools yang diizinkan, dibatasi kuota panggilan model, panggilan tool, dan batas waktu profil.
3. **Perapian & konversi**: naskah dibersihkan dari pola tulisan AI yang klise, judul H1 ganda dirapikan, lalu dikonversi otomatis ke blok Gutenberg (`<!-- wp:paragraph -->`, `<!-- wp:heading -->`, dll.).
4. **Pengiriman**: naskah dan metadata dikirim ke WordPress sesuai status yang Anda pilih.

Agen dilengkapi pengaman: panggilan tool identik berulang dicegah, tool yang gagal berturut-turut dinonaktifkan, dan bila batas tercapai agen diminta menyelesaikan naskah sekali saja.

---

## 5. Skill Registry (`SKILL.md`)

Menu **Skill Registry** ([/skills](/skills)) berisi pedoman keahlian untuk Agent Profile mode Deep.

- **Skill sistem** (misalnya `anti-ai-editor`, pedoman humanisasi naskah bahasa Indonesia) bersifat baca-saja. Buat skill baru bila ingin menyesuaikannya.
- **Tambah Skill Baru** ([/skills/new](/skills/new)): isi **Nama keahlian**, **Slug (ID pemanggilan)**, **Deskripsi singkat**, dan **Isi SKILL.md**, atau klik **Unggah berkas .md**. Klik **Simpan Skill Baru**.
- Skill kustom dapat diedit (slug tidak dapat diubah) dan dihapus. Agent Profile yang memakai slug yang dihapus tidak lagi memuat skill tersebut.
- Filter **Sistem** / **Kustom Saya** dan kolom pencarian membantu menemukan skill.

Skill hanya dimuat bila dicentang di Agent Profile bermode Deep.

---

## 6. Menguji di Laboratorium

**Laboratorium** ([/lab](/lab)) hanya tampil bila **Developer Mode** aktif di **Pengaturan → Profil & Preferensi Akun**.

- Tab **Tools**: jalankan setiap Universal Tool secara terpisah. Tersedia juga **WordPress Publisher (Direct Test)** untuk menguji kirim artikel contoh ke WordPress (bawaan **Draft**).
- Tab **Agent Profile**: pilih profil, **Target website WordPress** (atau **Mode simulasi (tanpa WordPress)**), bahasa, kata kunci, dan brief, lalu klik **Jalankan Agent Profile**. Hasilnya berupa pratinjau naskah, blok Gutenberg, dan telemetri run. Artikel tidak dikirim ke WordPress, tetapi tool `upload_media` tetap dapat mengunggah foto bila website dipilih.

Uji Agent Profile memakai kunci OpenRouter Anda dan dapat menimbulkan biaya token.
