# Manajemen Profil Agen & Penulisan AI

Sistem penulisan di Panitera tidak menggunakan alur kaku berbasis template teks biasa. Melainkan menggunakan **Agent Profile Runtime** di mana Anda dapat menentukan persona, gaya bahasa, alat riset (*tools*), serta keahlian editorial (*skills*) yang dapat digunakan agen AI secara otonom.

---

## 1. Jenis Engine Agen

Saat membuat profil agen baru di menu **Profil Agen** (`/agents`), Anda dapat memilih salah satu dari dua mode:

### A. Standard LangChain Agent
- Menggunakan ekosistem LangChain `createAgent`.
- Cocok untuk alur penulisan cepat hingga menengah dengan pemanggilan tools terarah.
- Sangat efisien dalam penggunaan token dan waktu eksekusi.

### B. Deep Agent (LangChain Deep Agents)
- Agen otonom dengan penalaran bertahap (*multi-step reasoning*).
- Memiliki kapabilitas membaca berkas keahlian (`SKILL.md`) di direktori virtual eksekusinya.
- Mampu membedah topik secara investigatif, melakukan verifikasi data silang, dan membaca rujukan artikel panjang via `web_reader`.

---

## 2. Universal Tools yang Tersedia

Setiap agen dapat dipersenjatai dengan tools mandiri sesuai kebutuhan:

1. **`web_search`**: Mencari referensi faktual, data statistik, dan kutipan dari internet via SearXNG, Tavily, atau Brave.
2. **`web_reader`**: Membaca dan mengekstrak naskah teks lengkap dari tautan URL artikel rujukan.
3. **`image_search`**: Mencari foto landscape berkualitas tinggi bebas royalti (lebar minimal 1280px) untuk featured image atau foto subbab.
4. **`set_featured_image`**: Memilih dan menyetel gambar sampul utama (Featured Image) secara langsung dari kurasi gambar web.
5. **`upload_media`**: Mengunggah foto hasil kurasi ke WordPress Media Library dan menyematkannya ke dalam subbab naskah.
6. **`keyword_suggestions`**: Menggali autocomplete search engine dan entitas kata kunci LSI untuk memetakan struktur subbab H2/H3.

> [!NOTE]
> Taksonomi (kategori & tag) dan pemilihan author WordPress tidak lagi memerlukan tool manual karena diselesaikan secara otomatis oleh **Pre-Flight Taxonomy & Author Resolver** sebelum agen mulai menulis.

---

## 3. Skill Registry (`SKILL.md`)

Pada mode **Deep Agent**, Anda dapat mengaktifkan modul keahlian khusus dari menu **Skill Registry** (`/skills`). 
Setiap berkas `SKILL.md` berisi instruksi mendalam, misalnya:
- **`anti-ai-editor`**: Pedoman penulisan humanis untuk mengeliminasi formula klise AI, meningkatkan variasi kalimat, dan menjaga keaslian gaya editorial bahasa Indonesia.
- **Keahlian Kustom**: Anda dapat membuat skill baru di `/skills/new` dengan memuat pedoman SEO, tone of voice merek Anda, atau aturan jurnalistik spesifik.

---

## 4. Konversi Otomatis ke Gutenberg Blocks

Naskah yang ditulis oleh agen dalam format Markdown murni akan dikonversi secara deterministik oleh sistem ke **Native WordPress Gutenberg Blocks** (`<!-- wp:heading -->`, `<!-- wp:paragraph -->`, `<!-- wp:image -->`, `<!-- wp:list -->`, dll.) sebelum dikirim ke WordPress. Anda tidak perlu khawatir tentang kompatibilitas tema atau editor blok WordPress.
