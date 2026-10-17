---
description: Deskripsi tool keluaran terstruktur extract-article yang dipakai agen penulis untuk menyerahkan naskah (title, excerpt, body)
used_by:
  - src/core/writer/runtime/article-submission.ts
variables: []
---

[SYSTEM_PROMPT]
Submit the finished article as three separate fields: title, excerpt, and body (pure Markdown). Call this exactly once, alone (no other tool calls in the same turn), as your very last step after all research is done. The system checks the fields; if it lists problems, fix every one and call this tool again with all three fields complete.
[/SYSTEM_PROMPT]
