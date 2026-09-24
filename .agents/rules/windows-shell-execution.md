# Aturan Eksekusi Perintah Shell di Lingkungan Windows PowerShell

Dokumen ini adalah **Aturan Baku Operasional Lingkungan (Environment Execution Rule)** untuk seluruh AI Agent di repositori `wp-autopost-dashboard` pada sistem operasi Windows.

---

## 1. Latar Belakang Masalah (PowerShell Script Execution Policy)

Di sistem operasi Windows dengan shell PowerShell, pemanggilan perintah seperti:
- `npx <package>`
- `npm <subcommand>`

Secara default mencoba mengeksekusi script PowerShell (`npx.ps1` / `npm.ps1`). Jika kebijakan eksekusi script sistem (*Execution Policy*) dibatasi (misal: *Restricted* atau *RemoteSigned*), perintah akan **GAGAL TOTAL** dengan galat:
```
npx : File C:\nvm4w\nodejs\npx.ps1 cannot be loaded because running scripts is disabled on this system.
    + CategoryInfo          : SecurityError: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess
```

---

## 2. Aturan Baku Eksekusi Perintah

Setiap kali Agent menyusun `CommandLine` untuk tool `run_command`:

1. **Gunakan Ekstensi `.cmd` Secara Eksplisit**:
   - ✅ Gunakan `npx.cmd <perintah>` (bukan `npx <perintah>`).
   - ✅ Gunakan `npm.cmd <perintah>` (bukan `npm <perintah>`).
   - Contoh:
     - `npx.cmd shadcn@latest add dialog`
     - `npx.cmd tsc --noEmit`
     - `npm.cmd run build`
     - `npm.cmd install @openrouter/agent`

2. **Alternatif yang Diperbolehkan**:
   - `cmd /c npx <perintah>`
   - `cmd /c npm <perintah>`

3. **Jaring Pengaman Otomatis (Lifecycle Hook)**:
   - Sistem dilengkapi dengan hook **`windows-command-normalizer`** di [`.agents/hooks.json`](file:///d:/Antigravity/wp-autopost-dashboard/.agents/hooks.json).
   - Hook ini berjalan pada fase `PreToolUse` dan secara otomatis meng-overwrite perintah yang tidak sengaja diawali `npx` atau `npm` menjadi `npx.cmd` / `npm.cmd` sebelum diteruskan ke shell, sehingga proses tidak akan pernah terblokir oleh `PSSecurityException`.
