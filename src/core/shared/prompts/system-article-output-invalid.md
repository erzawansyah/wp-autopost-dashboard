---
description: Pesan koreksi ke agen penulis saat naskah yang diserahkan lewat extract-article melanggar aturan field
used_by:
  - src/core/writer/runtime/article-submission.ts
variables:
  - key: issues
    desc: Daftar pelanggaran, satu per baris (diawali "- ")
  - key: attemptsLeft
    desc: Sisa kesempatan menyerahkan ulang sebelum naskah diterima apa adanya
  - key: language
    desc: Nama bahasa artikel (mis. English (US/UK)); pesan koreksi berbahasa Inggris tidak boleh menggeser bahasa naskah
---

[SYSTEM_PROMPT]
The article was NOT accepted. Fix every problem below, then call `extract-article` again with all three fields (title, excerpt, body) complete, not only the changed parts. Keep every fact, figure, quote, and source unchanged while fixing the format, and keep all three fields in {{language}}, the article language.
Problems:
{{issues}}
Remaining correction attempts: {{attemptsLeft}}. After that, the last submission is published as it is.
[/SYSTEM_PROMPT]
