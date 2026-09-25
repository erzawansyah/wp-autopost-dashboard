# Subsystem Internal Link Auditor (`src/core/link-auditor/`)

Domain ini disiapkan untuk audit arsitektur tautan internal (*internal linking graph*), deteksi artikel yatim (*orphan posts*), dan penyisipan tautan internal cerdas secara otomatis.

## Rencana Kemampuan (Engines):
- `orphan-linker`: Mendeteksi artikel WordPress yang belum memiliki tautan masuk (inbound internal links) dan menyisipkan tautan kontekstual dari artikel seinduk.
- `topical-clusterer`: Membangun struktur tautan cluster (Pillar Post ↔ Cluster Posts) berdasarkan kesamaan entitas semantik.
- `anchor-optimizer`: Mengaudit teks jangkar (*anchor text*) agar bervariasi alami dan tidak terkena penalti over-optimization.

## Hubungan Dependensi:
- Menggunakan `src/core/shared/tools/wp/` untuk merayapi postingan WordPress dan memperbarui konten postingan.
- Menggunakan `src/core/shared/services/llm.ts` untuk pencocokan semantik konteks kalimat sebelum menyisipkan link.
