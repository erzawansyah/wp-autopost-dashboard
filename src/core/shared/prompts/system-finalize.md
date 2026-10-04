---
used-by: src/core/writer/runtime/finalize.ts
description: Template sintesis darurat naskah artikel utuh ketika batas loop agent tercapai
variables: reason, factsList, mediaEmbeds, keyword, language, targetWordCount, briefText, authorText, instructionsText
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

ATURAN STRICT:
1. DILARANG ada angka sitasi akademis seperti [1], [2], [^1]. Integrasikan fakta langsung secara mengalir.
2. DILARANG membuat section "Referensi" atau "Daftar Pustaka" di akhir naskah.
3. DILARANG penomoran subbab (seperti "## 1. ...") dan DILARANG ada judul "Kesimpulan".
4. Sajikan naskah lengkap dari pembuka hingga solusi praktis.
[/USER_PROMPT]
