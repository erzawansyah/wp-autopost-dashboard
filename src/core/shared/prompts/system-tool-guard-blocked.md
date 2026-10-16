---
description: Pemberitahuan ke agen saat panggilan tool diblokir loop guard (kuota global/per-tool habis atau circuit breaker terbuka)
used_by:
  - src/core/writer/runtime/loop-guard.ts
variables:
  - key: reason
    desc: Kalimat fakta penyebab pemblokiran, mis. batas total panggilan tool tercapai atau tool dinonaktifkan circuit breaker
  - key: target
    desc: Sasaran larangan pemanggilan ulang, mis. "tool 'web_search'" atau "any research tool" saat kuota global habis
---

[SYSTEM_PROMPT]
WARNING: {{reason}} Do NOT call {{target}} again. Finish the complete article with the data and context you have already collected and submit it with `extract-article`.
[/SYSTEM_PROMPT]
