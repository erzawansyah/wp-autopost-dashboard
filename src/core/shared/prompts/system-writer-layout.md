---
description: Tata letak system prompt agen penulis (guardrail, paket gaya bahasa artikel, lalu workflow Agent Profile)
used_by:
  - src/core/writer/runtime/prompt-builder.ts
variables:
  - key: guardrail
    desc: Isi system-guardrail.md
  - key: stylePack
    desc: Isi paket gaya sesuai bahasa artikel (system-style-id/en/general.md)
  - key: workflow
    desc: Workflow prompt Agent Profile (bawaan atau kustom pengguna) yang sudah dirender
---

[SYSTEM_PROMPT]
{{guardrail}}

---

{{stylePack}}

---

# AGENT WORKFLOW (from the Agent Profile; the rules above take precedence)

{{workflow}}
[/SYSTEM_PROMPT]
