---
description: Respons pengganti saat anggaran panggilan model run (agen utama + subagent Deep Agent) habis; mengakhiri loop agen tanpa memanggil LLM
used_by:
  - src/core/writer/runtime/guards.ts
variables:
  - key: limit
    desc: Batas total panggilan model untuk satu run (maxModelCalls Agent Profile setelah clamp)
---

[SYSTEM_PROMPT]
PEMBERITAHUAN SISTEM: Batas total {{limit}} panggilan model untuk run ini sudah habis, sehingga eksekusi agen dihentikan. Naskah akhir disusun dari data dan konteks yang sudah terkumpul.
[/SYSTEM_PROMPT]
