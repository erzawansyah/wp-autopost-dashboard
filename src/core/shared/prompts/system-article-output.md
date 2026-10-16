---
description: Aturan tiga field keluaran naskah (title, excerpt, body) untuk prompt penulisan agen dan finalize call
used_by:
  - src/core/writer/runtime/prompt-builder.ts
  - src/core/writer/runtime/finalize.ts
variables:
  - key: titleMaxChars
    desc: Panjang judul maksimal (karakter), dari settings.json articleOutput
  - key: excerptMinChars
    desc: Panjang excerpt minimal (karakter)
  - key: excerptMaxChars
    desc: Panjang excerpt maksimal (karakter)
  - key: minH2Sections
    desc: Jumlah minimal subbab utama H2 di body
---

[USER_PROMPT]
ARTICLE FIELDS (the article is delivered as exactly three separate fields):
- title: the article title in the article language, plain text, at most {{titleMaxChars}} characters. If the brief sets a required title, use it exactly.
- excerpt: the meta description in the article language, plain text, {{excerptMinChars}} to {{excerptMaxChars}} characters, a complete sentence or two.
- body: the complete article in pure Markdown. Start with the 1 to 2 opening paragraphs (no heading above them), then at least {{minH2Sections}} main sections as `## ` headings, with `### ` only for subsections inside them. Never put the title, a `# ` heading, HTML tags (not even `<br>`), or "TITLE:"/"EXCERPT:" lines in the body.
[/USER_PROMPT]
