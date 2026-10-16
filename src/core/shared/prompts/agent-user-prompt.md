---
description: Template pesan permintaan penulisan artikel (brief) dari pengguna ke agen penulis
used_by:
  - src/core/writer/runtime/prompt-builder.ts
variables:
  - key: keyword
    desc: Kata kunci atau topik utama artikel
  - key: language
    desc: Nama bahasa artikel (misal Bahasa Indonesia)
  - key: targetWords
    desc: Target minimal jumlah kata naskah
  - key: siteName
    desc: Nama website WordPress target (kosong bila tidak ada situs, mis. Lab)
  - key: siteUrl
    desc: URL website WordPress target (kosong bila tidak ada situs)
  - key: title
    desc: Judul wajib dari pengguna (kosong = agen menulis judul sendiri)
  - key: categoryName
    desc: Nama kategori WordPress hasil Pre-Flight Resolver (kosong bila tidak ada)
  - key: tagsList
    desc: Daftar tag WordPress hasil Pre-Flight Resolver (kosong bila tidak ada)
  - key: authorName
    desc: Nama persona author WordPress (kosong bila tidak ada)
  - key: authorBio
    desc: Bio author dalam tanda kurung diawali spasi (kosong bila author tidak punya bio)
  - key: availableTools
    desc: Daftar nama tool riset/visual yang aktif di run ini, dipisah koma (kosong bila tanpa tools)
  - key: brief
    desc: Catatan atau brief dari pengguna (kosong bila tidak ada)
  - key: customInstructions
    desc: Instruksi tambahan dari form permintaan (kosong bila tidak ada)
  - key: outputFormat
    desc: Isi system-article-output.md (aturan field title, excerpt, body)
---

[USER_PROMPT]
Write a complete, publication-ready article for the brief below. Empty fields mean "not specified".

ARTICLE BRIEF
- Topic / main keyword: "{{keyword}}"
- Article language: {{language}} (write the title, excerpt, body, alt text, and captions in this language)
- Minimum length: {{targetWords}} words
- Publication: {{siteName}} {{siteUrl}}
- Required title (if set, use it exactly as the title field; if empty, write your own): {{title}}
- WordPress category: {{categoryName}}
- WordPress tags: {{tagsList}}
- Author persona (write from this perspective; background only, never print a byline): {{authorName}}{{authorBio}}
- Research and image tools available in this run (if empty, there are none: write without research and without images): {{availableTools}}
- Notes from the user: {{brief}}
- Additional instructions from the user: {{customInstructions}}

Structure: 1 to 2 opening paragraphs, then at least 5 descriptive H2 sections with multi-paragraph depth.

{{outputFormat}}

When the article is final, deliver it by calling `extract-article` with these three fields.
[/USER_PROMPT]
