---
description: Pesan penolakan operasi tulis/ubah/hapus pada filesystem virtual read-only Deep Agent (skill SKILL.md)
used_by:
  - src/core/writer/runtime/build-agent.ts
variables:
  - key: operation
    desc: Nama operasi berkas yang ditolak (write_file, edit_file, atau delete)
---

[SYSTEM_PROMPT]
PEMBERITAHUAN SISTEM: Operasi {{operation}} dinonaktifkan karena filesystem agen bersifat read-only. Anda DILARANG menulis, mengubah, atau menghapus berkas virtual. Segera sajikan seluruh naskah artikel lengkap dan tuntas langsung sebagai pesan teks respons akhir Anda.
[/SYSTEM_PROMPT]
