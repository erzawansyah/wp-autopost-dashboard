---
description: Instruksi keluaran JSON murni yang ditambahkan gateway LLM ke system prompt setiap panggilan JSON terstruktur
used_by:
  - src/core/shared/llm/gateway.ts
variables: []
---

[SYSTEM_PROMPT]
IMPORTANT: Output ONLY raw, valid JSON in the requested format: no preamble or closing text, no Markdown code fences, and no explanation outside the JSON.
[/SYSTEM_PROMPT]
