#!/usr/bin/env node
/**
 * SessionStart hook — siapkan dependensi di sesi Claude Code cloud.
 *
 * Hanya aktif bila CLAUDE_CODE_REMOTE=true (container web/cloud yang selalu
 * di-clone bersih). Di mesin lokal hook ini tidak melakukan apa-apa.
 */
import { existsSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"

if (process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
if (existsSync(path.join(root, "node_modules", ".package-lock.json"))) process.exit(0)

try {
  execSync("npm ci --no-audit --no-fund", { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  console.log("Dependensi npm terpasang (npm ci).")
} catch {
  // Jangan gagalkan sesi; agent akan melihat pesan ini sebagai konteks.
  console.log("Peringatan: npm ci gagal saat SessionStart. Jalankan `npm ci` manual sebelum tsc/lint.")
}
