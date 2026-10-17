---
description: Balasan loop guard untuk panggilan tool dengan argumen identik dengan panggilan sukses sebelumnya (hasil lama dipakai ulang)
used_by:
  - src/core/writer/runtime/loop-guard.ts
variables:
  - key: cachedContent
    desc: Konten hasil tool dari panggilan sebelumnya dengan argumen yang persis sama
---

[SYSTEM_PROMPT]
[CACHED RESULT FROM AN EARLIER CALL]:
{{cachedContent}}

Note: you already called this tool with exactly the same arguments. Use the result above and do not call it again.
[/SYSTEM_PROMPT]
