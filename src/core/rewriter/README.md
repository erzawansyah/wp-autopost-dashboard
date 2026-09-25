# Subsystem Content Rewriter (`src/core/rewriter/`)

Domain ini disiapkan untuk fungsionalitas peremajaan, penyuntingan ulang, dan transformasi konten artikel yang sudah ada di WordPress.

## Rencana Kemampuan (Engines):
- `seo-refresh`: Memperbarui artikel lama dengan data fakta, statistik, dan keyword tren terbaru tanpa menghilangkan substansi aslinya.
- `tone-transform`: Mengubah gaya penulisan artikel (misal: dari laporan kaku menjadi listicle santai atau esai reflektif).
- `expand-depth`: Menambahkan sub-topik baru ke artikel pendek agar lebih berbobot dan menaikkan ranking SEO.

## Hubungan Dependensi:
- Menggunakan `src/core/shared/services/llm.ts` untuk inferensi AI.
- Menggunakan `src/core/shared/formatters/gutenberg.ts` untuk serialisasi blok WordPress.
- Menggunakan `src/core/shared/tools/wp/` untuk mengambil naskah lama (`GET /wp/v2/posts/[id]`) dan memperbaruinya (`POST /wp/v2/posts/[id]`).
