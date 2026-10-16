---
description: Format keluaran naskah Markdown-first (TITLE/EXCERPT/---) yang ditambahkan ke prompt penulisan agen dan finalize call
used_by:
  - src/core/writer/runtime/prompt-builder.ts
  - src/core/writer/runtime/finalize.ts
variables: []
---

[USER_PROMPT]
OUTPUT FORMAT (exactly this, nothing before or after):
TITLE: <article title in the article language, at most 60 characters>
EXCERPT: <meta description in the article language, 130 to 160 characters>
---
<full article body in pure Markdown, starting with the opening paragraphs>

Write the whole output (TITLE, EXCERPT, separator, and the complete body) in ONE final message, after your last tool call. Never write parts of the article in earlier messages or between tool calls.
The title appears only on the TITLE line: never repeat it as a heading in the body. Main sections use `##`.
[/USER_PROMPT]
