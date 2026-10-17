---
description: Pemberitahuan ke agen saat panggilan tool diblokir loop guard (kuota global/per-tool habis atau circuit breaker terbuka)
used_by:
  - src/core/writer/runtime/loop-guard.ts
variables:
  - key: reason
    desc: Kalimat fakta penyebab pemblokiran, mis. batas total panggilan tool tercapai atau tool dinonaktifkan circuit breaker
  - key: target
    desc: Sasaran larangan pemanggilan ulang, mis. "tool 'web_search'" atau "any tool except `extract-article`" saat kuota global habis
---

[SYSTEM_PROMPT]
WARNING: {{reason}} Do NOT call {{target}} again. Finish your work with the data and context you have already collected: if you are writing the article, submit the complete article with `extract-article`; if you were delegated a research task, return your findings as your final message.
[/SYSTEM_PROMPT]
