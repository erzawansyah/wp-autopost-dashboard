---
description: Pesan penolakan operasi tulis/ubah/hapus pada filesystem virtual read-only Deep Agent (skill SKILL.md)
used_by:
  - src/core/writer/runtime/build-agent.ts
variables:
  - key: operation
    desc: Nama operasi berkas yang ditolak (write_file, edit_file, atau delete)
---

[SYSTEM_PROMPT]
SYSTEM NOTICE: The {{operation}} operation is disabled because the agent filesystem is read-only. Do not write, edit, or delete virtual files. Deliver the complete article directly as your final text message now.
[/SYSTEM_PROMPT]
