---
description: Template sintesis darurat naskah artikel utuh ketika batas loop agent tercapai
used_by:
  - src/core/writer/runtime/finalize.ts
variables:
  - key: reason
    desc: Alasan pemanggilan finalize (misal batas tool atau batas putaran loop)
  - key: factsList
    desc: Rangkuman fakta dan kutipan yang berhasil dihimpun dari tools riset
  - key: mediaEmbeds
    desc: Daftar gambar yang berhasil diunggah ke WordPress
  - key: keyword
    desc: Topik atau kata kunci artikel
  - key: language
    desc: Bahasa tulisan artikel
  - key: targetWordCount
    desc: Target jumlah kata minimal artikel
  - key: briefText
    desc: Catatan atau brief pengarahan dari pengguna
  - key: authorText
    desc: Sudut pandang persona penulis WordPress
  - key: instructionsText
    desc: Instruksi khusus tambahan
---

[USER_PROMPT]
SINTESIS FINAL NASKAH ARTIKEL:
Proses pengumpulan data dan media telah selesai ({{reason}}). Sekarang susun artikel lengkap, mendalam, dan berkualitas editorial tinggi dalam naskah utuh.

=== DATA RISET AKTUAL DARI TOOLS ===
{{factsList}}

=== GAMBAR YANG TELAH DIUNGGAH KE WORDPRESS ===
{{mediaEmbeds}}

=== KETENTUAN PENULISAN ===
- Topik: "{{keyword}}"
- Bahasa: {{language}}
- Target Panjang: minimal {{targetWordCount}} kata
- Struktur: Wajib minimal 5 subbab (H2/H3) deskriptif dengan ulasan mendalam per subbab. DILARANG membuat naskah pendek atau ringkasan!
{{briefText}}
{{authorText}}
{{instructionsText}}

ATURAN STRICT (ANTI-AI SLOP):
1. DILARANG membuat subbab generik klise seperti: "Pembuka", "Pendahuluan", "Latar Belakang", "Analisis", "Contoh", atau "Kesimpulan Praktis". Seluruh subbab (H2/H3) WAJIB berupa judul tematik spesifik dan berbobot.
2. DILARANG membuka artikel dengan pengumuman meta seperti: "Dalam artikel ini kita akan membahas...", atau definisi klise "X merupakan aspek penting...". Buka langsung dengan fakta menarik, studi kasus, atau dinamika nyata.
3. DILARANG ada angka sitasi akademis seperti [1], [2], [^1]. Integrasikan fakta langsung secara mengalir.
4. DILARANG membuat section "Referensi" atau "Daftar Pustaka" di akhir naskah.
5. DILARANG penomoran subbab (seperti "## 1. ...") dan DILARANG ada penutup hambar ("Dalam artikel ini, kita telah membahas...").
6. Sajikan naskah lengkap, kaya wawasan, multi-paragraf per subbab, dari pembuka sampai rekomendasi strategis.
[/USER_PROMPT]
