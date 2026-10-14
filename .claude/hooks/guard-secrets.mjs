#!/usr/bin/env node
/**
 * PreToolUse hook — Zero Secret Leaks (lihat .claude/rules/security.md §5)
 *
 * - Edit/Write: tolak penulisan ke berkas .env* (kecuali .env.example) dan
 *   tolak konten yang memuat pola secret nyata.
 * - Bash: tolak perintah yang membaca/menyalin berkas .env* (kecuali .env.example).
 *
 * Diblokir dengan exit code 2; stderr dikirim balik ke Claude sebagai alasan.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

const SECRET_PATTERNS = [
  [/sk-or-v1-[A-Za-z0-9]{32,}/, "API key OpenRouter"],
  [/sk-(?:proj-|ant-)?[A-Za-z0-9_-]{40,}/, "API key OpenAI/Anthropic"],
  [/sb_secret_[A-Za-z0-9_-]{20,}/, "Supabase secret key"],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT (mis. Supabase service_role)"],
  [/postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{6,}@/, "connection string Postgres berpassword"],
  [/tvly-[A-Za-z0-9]{20,}/, "API key Tavily"],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, "token GitHub"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/ENCRYPTION_MASTER_KEY\s*=\s*["']?[0-9a-fA-F]{64}/, "ENCRYPTION_MASTER_KEY"],
]

const isProtectedEnvFile = (p) => {
  const base = path.basename(p)
  return /^\.env(\..+)?$/.test(base) && base !== ".env.example"
}

// Token .env / .env.local / .env.production … sebagai argumen perintah shell
const ENV_TOKEN = /(?:^|[\s"'=/<>|;&(])\.env(?:\.(?!example\b)[\w.*?-]+|[*?[][^\s"'|;&)>]*)?(?=$|[\s"'|;&)>])/

function block(reason) {
  process.stderr.write(`[guard-secrets] ${reason}\n`)
  process.exit(2)
}

let input
try {
  input = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0) // input tidak terbaca → jangan menghalangi
}

const tool = input.tool_name
const ti = input.tool_input ?? {}

if (tool === "Edit" || tool === "Write") {
  const filePath = String(ti.file_path ?? "")
  if (isProtectedEnvFile(filePath)) {
    block(`Menulis ke ${path.basename(filePath)} diblokir. Berkas .env* hanya diisi manual oleh pengguna; ubah .env.example bila perlu menambah variabel baru.`)
  }
  const text = [ti.content, ti.new_string].filter((v) => typeof v === "string").join("\n")
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) {
      block(`Konten memuat pola ${label}. Jangan menulis secret nyata ke repo; gunakan process.env dan placeholder di .env.example.`)
    }
  }
}

if (tool === "Bash") {
  const cmd = String(ti.command ?? "")
  if (ENV_TOKEN.test(cmd)) {
    block("Perintah ini menyentuh berkas .env*. Secret tidak boleh dibaca/disalin oleh agent; minta pengguna memeriksa nilainya sendiri, atau gunakan .env.example.")
  }
}

process.exit(0)
