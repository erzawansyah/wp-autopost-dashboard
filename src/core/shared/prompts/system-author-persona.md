---
description: Baris instruksi sudut pandang persona author WordPress untuk prompt penulisan agen dan finalize call
used_by:
  - src/core/writer/runtime/prompt-builder.ts
variables:
  - key: authorName
    desc: Nama tampilan author WordPress terpilih
  - key: authorBio
    desc: Bio singkat author dalam tanda kurung diawali spasi (kosong bila author tidak punya bio)
---

[USER_PROMPT]
- Sudut Pandang Penulis (Persona): Tulis naskah dari perspektif {{authorName}}{{authorBio}}. (DILARANG mencantumkan teks byline 'Penulis: ...' ke naskah).
[/USER_PROMPT]
