---
description: Pesan penolakan operasi tulis/ubah/hapus pada filesystem virtual read-only Deep Agent (skill SKILL.md)
used_by:
  - src/core/writer/runtime/build-agent.ts
variables:
  - key: operation
    desc: Nama operasi berkas yang ditolak (write_file, edit_file, atau delete)
---

[SYSTEM_PROMPT]
SYSTEM NOTICE: The {{operation}} operation is disabled because the agent filesystem is read-only. Do not write, edit, or delete virtual files. If you are writing the article, submit the complete article with `extract-article` now; if you were delegated a research task, return your findings as your final message.
[/SYSTEM_PROMPT]
