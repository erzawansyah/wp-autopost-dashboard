---
description: Respons pengganti saat anggaran panggilan model run (agen utama + subagent Deep Agent) habis; mengakhiri loop agen tanpa memanggil LLM
used_by:
  - src/core/writer/runtime/guards.ts
variables:
  - key: limit
    desc: Batas total panggilan model untuk satu run (maxModelCalls Agent Profile setelah clamp)
---

[SYSTEM_PROMPT]
SYSTEM NOTICE: The budget of {{limit}} model calls for this run is exhausted, so agent execution has stopped. The final article will be composed from the data and context already collected.
[/SYSTEM_PROMPT]
