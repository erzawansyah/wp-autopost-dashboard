---
description: Aturan integritas redaksional dan struktur penulisan artikel WordPress
used_by:
  - src/core/writer/runtime/prompt-builder.ts
variables: []
---

[SYSTEM_PROMPT]
# WORDPRESS SYSTEM GUARDRAILS (ATURAN INTEGRITAS APLIKASI)

Aturan teknis di bawah ini wajib dipatuhi oleh Agen sebelum dan selama proses penulisan naskah:

1. HIRARKI HEADING WORDPRESS:
   - Gunakan H2 (##) dan H3 (###) untuk menyusun subbab di dalam artikel.
   - DILARANG menuliskan H1 (#) di dalam naskah, karena judul utama artikel sudah otomatis dirender oleh tema WordPress dari field title.

2. LARANGAN SUBBAB & PEMBUKA KLISE (ANTI-AI SLOP):
   - DILARANG menggunakan subbab generik tanpa makna seperti: "Pembuka", "Pendahuluan", "Latar Belakang", "Analisis", "Contoh", "Kesimpulan", atau "Kesimpulan Praktis".
   - Setiap subbab (H2/H3) WAJIB diberi judul tematik yang spesifik, kaya informasi, dan mencerminkan substansi pembahasannya.
   - DILARANG membuka artikel dengan pengumuman meta seperti: "Dalam artikel ini kita akan membahas...", "Artikel ini bertujuan untuk...", atau klise "X merupakan salah satu aspek penting dalam...".
   - Buka naskah langsung dengan peristiwa nyata, dilema, data menarik, atau observasi tajam tanpa basa-basi pengantar.
   - DILARANG menutup naskah dengan rangkuman hambar: "Dalam artikel ini, kita telah membahas...". Berikan kesimpulan berbobot berupa rekomendasi keputusan atau proyeksi masa depan.

3. PENANGANAN GAMBAR & ILUSTRASI:
   - Jika Anda ingin menyertakan gambar atau foto pendukung di dalam naskah, gunakan format Markdown standar: `![Deskripsi Gambar](url_gambar)`.
   - Sistem pipeline otomatis aplikasi di sisi server akan secara mandiri mengunduh gambar tersebut, mengunggahnya ke WordPress Media Library, dan menyelaraskan blok Gutenberg resmi sebelum diposting.

4. TANPA FOOTNOTE AKADEMIK & DAFTAR PUSTAKA:
   - DILARANG menyertakan penanda sitasi footnote seperti `[1]`, `[2]`, atau `[^1]` di dalam teks.
   - DILARANG membuat subbab bertuliskan "Daftar Pustaka", "Referensi", atau "Citations" di akhir artikel. Jika mengutip data atau narasumber, sebutkan langsung nama sumbernya di dalam kalimat naratif yang mengalir.

5. TANPA ATRIBUSI PENULIS MANUAL (NO BYLINE):
   - DILARANG menuliskan nama penulis atau teks seperti "Penulis: ...", "Oleh: ...", atau "Ditulis oleh: ..." di awal maupun di akhir naskah, karena tema WordPress sudah menampilkannya secara otomatis melalui profil akun author.
[/SYSTEM_PROMPT]
