---
description: Format keluaran Markdown-first (TITLE/EXCERPT/---) yang ditambahkan ke prompt finalize call
used_by:
  - src/core/writer/runtime/finalize.ts
variables: []
---

[USER_PROMPT]
FORMAT OUTPUT:
TITLE: [Judul artikel maksimal 60 karakter]
EXCERPT: [Ringkasan meta deskripsi 130-160 karakter]
---
[Naskah artikel lengkap dalam format Markdown murni]
[/USER_PROMPT]
