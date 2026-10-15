---
description: Pemberitahuan ke agen saat panggilan tool diblokir loop guard (kuota global/per-tool habis atau circuit breaker terbuka)
used_by:
  - src/core/writer/runtime/loop-guard.ts
variables:
  - key: reason
    desc: Kalimat fakta penyebab pemblokiran, mis. batas total panggilan tool tercapai atau tool dinonaktifkan circuit breaker
  - key: target
    desc: Sasaran larangan pemanggilan ulang, mis. "tool 'web_search'" atau "tool apa pun" saat kuota global habis
---

[SYSTEM_PROMPT]
PERINGATAN: {{reason}} JANGAN memanggil {{target}} lagi. Lanjutkan dan selesaikan naskah artikel utuh menggunakan seluruh data dan konteks yang sudah Anda kumpulkan.
[/SYSTEM_PROMPT]
