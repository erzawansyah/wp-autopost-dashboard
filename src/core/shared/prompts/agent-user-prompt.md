---
description: Template utama prompt permintaan penulisan artikel dari pengguna ke agen AI
used_by:
  - src/core/writer/runtime/prompt-builder.ts
variables:
  - key: keyword
    desc: Kata kunci atau topik utama artikel
  - key: language
    desc: Nama bahasa penulisan artikel (misal Bahasa Indonesia)
  - key: targetWords
    desc: Target jumlah kata naskah artikel
  - key: categoryInfo
    desc: Nama kategori WordPress yang ditetapkan
  - key: tagsInfo
    desc: Daftar tag WordPress yang dikaitkan
  - key: briefNote
    desc: Catatan atau brief pengarahan dari pengguna
  - key: authorPersona
    desc: Sudut pandang kepengarangan persona author WordPress
  - key: customInstructions
    desc: Instruksi tambahan khusus dari form permintaan penulisan
---

[USER_PROMPT]
Tuliskan artikel mendalam, komprehensif, mengalir alami, dan tuntas dengan ketentuan berikut:
- Topik / Kata Kunci Utama: "{{keyword}}"
- Bahasa: {{language}}
- Target Panjang: minimal {{targetWords}} kata
{{categoryInfo}}
{{tagsInfo}}
- Struktur Wajib: Rancang minimal 5 subbab (H2/H3) deskriptif dengan pembahasan multi-paragraf yang tuntas. DILARANG membuat naskah pendek atau ringkasan!
{{briefNote}}
{{authorPersona}}
{{customInstructions}}

Sajikan naskah lengkap dan seluruh metadata artikel sesuai instruksi alur kerja editorial.
[/USER_PROMPT]
