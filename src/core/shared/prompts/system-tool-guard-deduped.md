---
description: Balasan loop guard untuk panggilan tool dengan argumen identik dengan panggilan sukses sebelumnya (hasil lama dipakai ulang)
used_by:
  - src/core/writer/runtime/loop-guard.ts
variables:
  - key: cachedContent
    desc: Konten hasil tool dari panggilan sebelumnya dengan argumen yang persis sama
---

[SYSTEM_PROMPT]
[HASIL TERSIMPAN DARI PANGGILAN SEBELUMNYA]:
{{cachedContent}}

Catatan: Anda sudah pernah memanggil tool ini dengan parameter yang persis sama. Gunakan hasil di atas tanpa memanggil ulang.
[/SYSTEM_PROMPT]
