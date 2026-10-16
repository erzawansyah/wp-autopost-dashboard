---
description: Template sintesis naskah artikel utuh (tanpa tools) ketika loop agen berhenti karena batas atau naskahnya terlalu pendek
used_by:
  - src/core/writer/runtime/finalize.ts
variables:
  - key: reason
    desc: Alasan pemanggilan finalize (misal limit_reached atau timeout_exceeded)
  - key: factsList
    desc: Rangkuman sumber dan cuplikan yang berhasil dihimpun tools riset (kosong bila tidak ada)
  - key: mediaEmbeds
    desc: Gambar dari tools gambar run ini dalam sintaks Markdown (kosong bila tidak ada)
  - key: keyword
    desc: Topik atau kata kunci artikel
  - key: language
    desc: Nama bahasa artikel
  - key: targetWordCount
    desc: Target minimal jumlah kata naskah
  - key: title
    desc: Judul wajib dari pengguna (kosong = tulis judul sendiri)
  - key: brief
    desc: Catatan atau brief dari pengguna (kosong bila tidak ada)
  - key: authorName
    desc: Nama persona author WordPress (kosong bila tidak ada)
  - key: authorBio
    desc: Bio author dalam tanda kurung diawali spasi (kosong bila tidak ada)
  - key: customInstructions
    desc: Instruksi tambahan dari pengguna (kosong bila tidak ada)
  - key: outputFormat
    desc: Isi system-article-output.md (format TITLE/EXCERPT/---)
---

[USER_PROMPT]
FINAL SYNTHESIS
The research phase has ended ({{reason}}). No tools are available in this step: do not plan more research and do not call tools. Write the complete article now from the material below, following the guardrails, the writing style, and the workflow standards in the system prompt. Empty fields mean "not specified".

RESEARCH MATERIAL (sources and snippets collected in this run; the only basis for specific figures, names, and quotes)
{{factsList}}

IMAGES AVAILABLE TO EMBED (use only these, or none)
{{mediaEmbeds}}

ARTICLE BRIEF
- Topic / main keyword: "{{keyword}}"
- Article language: {{language}} (write the title, excerpt, body, alt text, and captions in this language)
- Target length: {{targetWordCount}} words
- Required title (if set, use it exactly on the TITLE line; if empty, write your own): {{title}}
- Author persona (write from this perspective; background only, never print a byline): {{authorName}}{{authorBio}}
- Notes from the user: {{brief}}
- Additional instructions from the user: {{customInstructions}}

Rules for this step:
- Aim for the target length with real substance. If the research material is thin, write a shorter, accurate article with narrower claims instead of padding or inventing facts.
- At least 5 descriptive H2 sections; no numbered headings, no footnote markers, no reference list, no recap closing.

{{outputFormat}}
[/USER_PROMPT]
