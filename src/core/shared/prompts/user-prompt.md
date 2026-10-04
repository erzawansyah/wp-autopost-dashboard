---
used-by: src/core/writer/runtime/prompt-builder.ts
description: Template utama prompt permintaan penulisan artikel dari pengguna ke agen AI
variables: keyword, language, targetWords, categoryInfo, tagsInfo, briefNote, authorPersona, customInstructions
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
