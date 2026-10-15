/**
 * @file scripts/audit-codebase.ts
 * @description Audit kebersihan codebase Panitera (lihat .claude/rules/codebase-hygiene.md,
 * security.md, prompt-management.md, atomic-design-and-styling.md). Dijalankan lokal dan di CI.
 *
 * Pemeriksaan (ID dipakai di allowlist):
 * - orphan-file      : berkas TS/TSX di src/ yang tidak terjangkau dari entrypoint Next.js
 *                      (page/layout/route/loading/error/not-found/…, instrumentation, middleware/proxy)
 *                      maupun dari test (*.test.ts, src/test-utils/, supabase/tests/).
 * - test-only        : modul produksi yang hanya diimpor oleh test (kode mati di produksi).
 * - prompt-file      : validasi registry prompt src/core/shared/prompts/*.md — aturan tunggal di
 *                      scripts/build-prompts.ts (prefix pilar, frontmatter, variabel {{…}}, section,
 *                      OUTPUT_FORMAT, used_by ↔ kode pemakai, literal nama di load*Prompt*()).
 * - hardcoded-prompt : literal string/template di kode server yang menyerupai prompt LLM
 *                      (frasa persona, direktif kapital, atau teks instruksi multi-baris).
 * - legacy-term      : istilah "engine" pada identifier/teks UI (selain "search engine"/"metasearch engine");
 *                      istilah resmi adalah "Agent Profile".
 * - arbitrary-color  : nilai warna mentah di komponen/halaman (text-[#…], bg-[rgb(…)], style color "#…").
 * - raw-fetch        : fetch() di kode server ke URL non-relatif yang bukan host tetap terdaftar;
 *                      URL dari pengguna/LLM wajib lewat safeFetch()/wpFetch.
 *
 * Allowlist: scripts/audit-allowlist.json
 * - `externalHosts`: host tetap yang boleh dipanggil dengan fetch() biasa, beserta alasannya.
 * - `entries`: { check, file, max, reason } — temuan lama yang diterima sementara. `max` adalah
 *   batas jumlah temuan di berkas itu (ratchet): bertambah = gagal, berkurang = turunkan `max`.
 * Temuan baru di luar allowlist membuat skrip keluar dengan kode 1.
 *
 * @prerequisites
 * - Node.js 22 (type stripping bawaan; skrip hanya memakai sintaks TS yang dapat dihapus dan modul node:*).
 * - Tidak membutuhkan variabel .env.
 *
 * @usage
 * npm run audit:hygiene
 * node scripts/audit-codebase.ts [--verbose] [--strict]
 *   --verbose : tampilkan juga rincian temuan yang sudah di-allowlist.
 *   --strict  : entri allowlist yang basi (temuan sudah hilang/berkurang) ikut membuat gagal.
 *
 * @output
 * - Ringkasan per pemeriksaan; exit 0 bila bersih, exit 1 bila ada temuan baru atau allowlist tidak valid.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type * as PromptRegistryBuild from "./build-prompts"

const ROOT = path.resolve(import.meta.dirname, "..")
const ALLOWLIST_PATH = path.join(ROOT, "scripts", "audit-allowlist.json")
const PROMPTS_DIR = "src/core/shared/prompts"
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".workspaces", ".claude", "out", "build", "dist", "coverage"])
const CODE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const RESOLVE_EXT = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"]

const CHECK_IDS = [
  "orphan-file",
  "test-only",
  "prompt-file",
  "hardcoded-prompt",
  "legacy-term",
  "arbitrary-color",
  "raw-fetch",
] as const
type CheckId = (typeof CHECK_IDS)[number]

const CHECK_TITLES: Record<CheckId, string> = {
  "orphan-file": "Berkas yatim (tidak terjangkau dari entrypoint/test)",
  "test-only": "Modul produksi yang hanya dipakai test",
  "prompt-file": "Berkas prompt .md (validasi registry: pilar, frontmatter, variabel, section, rujukan)",
  "hardcoded-prompt": "Prompt LLM hardcode di kode TS",
  "legacy-term": "Istilah legacy \"engine\" (gunakan Agent Profile)",
  "arbitrary-color": "Warna mentah/arbitrary di UI (gunakan token globals.css)",
  "raw-fetch": "fetch() mentah ke URL non-relatif (gunakan safeFetch/wpFetch)",
}

interface Finding {
  check: CheckId
  file: string
  line: number
  message: string
}

interface AllowEntry {
  check: CheckId
  file: string
  max: number
  reason: string
}

interface Allowlist {
  externalHosts: Map<string, string>
  entries: AllowEntry[]
}

const args = new Set(process.argv.slice(2))
const VERBOSE = args.has("--verbose")
const STRICT = args.has("--strict")

// ---------------------------------------------------------------------------
// Utilitas berkas
// ---------------------------------------------------------------------------

const toPosix = (p: string): string => p.split(path.sep).join("/")
const rel = (abs: string): string => toPosix(path.relative(ROOT, abs))

function walk(dirAbs: string, out: string[] = []): string[] {
  if (!existsSync(dirAbs)) return out
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dirAbs, entry.name), out)
    } else if (entry.isFile()) {
      out.push(path.join(dirAbs, entry.name))
    }
  }
  return out
}

const isTestFile = (f: string): boolean =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) || f.startsWith("src/test-utils/") || f.startsWith("supabase/")

const isClientModule = (src: string): boolean => /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(src)

// ---------------------------------------------------------------------------
// Lexer ringan: memisahkan komentar & literal string agar pemeriksaan tidak salah baca
// ---------------------------------------------------------------------------

interface Literal {
  quote: string
  start: number
  end: number
  /** Isi literal mentah; ekspresi `${…}` pada template diganti penanda "${…}". */
  value: string
}

interface SourceFile {
  file: string
  text: string
  /** Teks dengan komentar dikosongkan (baris dipertahankan). */
  code: string
  literals: Literal[]
  lineStarts: number[]
  isTest: boolean
  isClient: boolean
}

const REGEX_PRECEDERS = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"])
const REGEX_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"])
const IDENT_CHAR = /[A-Za-z0-9_$]/

type Frame = { kind: "code"; depth: number } | { kind: "tpl"; lit: Literal }

function lex(src: string): { code: string; literals: Literal[] } {
  const out = src.split("")
  const literals: Literal[] = []
  const stack: Frame[] = [{ kind: "code", depth: 0 }]
  const n = src.length
  let lastSig = ""
  let lastWord = ""
  let i = 0

  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " "
  }

  while (i < n) {
    const frame = stack[stack.length - 1]
    const c = src[i]

    if (frame.kind === "tpl") {
      if (c === "\\") {
        frame.lit.value += src.slice(i, i + 2)
        i += 2
      } else if (c === "`") {
        frame.lit.end = i + 1
        literals.push(frame.lit)
        stack.pop()
        lastSig = "`"
        lastWord = ""
        i++
      } else if (c === "$" && src[i + 1] === "{") {
        frame.lit.value += "${…}"
        stack.push({ kind: "code", depth: 0 })
        lastSig = "{"
        i += 2
      } else {
        frame.lit.value += c
        i++
      }
      continue
    }

    const next = src[i + 1]
    if (c === "/" && next === "/") {
      const nl = src.indexOf("\n", i)
      const end = nl === -1 ? n : nl
      blank(i, end)
      i = end
      continue
    }
    if (c === "/" && next === "*") {
      const close = src.indexOf("*/", i + 2)
      const end = close === -1 ? n : close + 2
      blank(i, end)
      i = end
      continue
    }
    if (c === "'" || c === '"') {
      // String biasa tidak boleh melewati baris baru → apostrof di teks JSX tidak merusak sisa berkas.
      let j = i + 1
      let value = ""
      while (j < n && src[j] !== c && src[j] !== "\n") {
        if (src[j] === "\\") {
          value += src.slice(j, j + 2)
          j += 2
        } else {
          value += src[j]
          j++
        }
      }
      const end = j < n && src[j] === c ? j + 1 : j
      literals.push({ quote: c, start: i, end, value })
      lastSig = c
      lastWord = ""
      i = end
      continue
    }
    if (c === "`") {
      stack.push({ kind: "tpl", lit: { quote: "`", start: i, end: i, value: "" } })
      i++
      continue
    }
    if (c === "/" && (REGEX_PRECEDERS.has(lastSig) || REGEX_KEYWORDS.has(lastWord)) && lastSig !== "<") {
      let j = i + 1
      let inClass = false
      while (j < n && src[j] !== "\n") {
        const d = src[j]
        if (d === "\\") {
          j += 2
          continue
        }
        if (inClass) {
          if (d === "]") inClass = false
        } else if (d === "[") {
          inClass = true
        } else if (d === "/") {
          break
        }
        j++
      }
      j++
      while (j < n && /[a-z]/i.test(src[j])) j++
      lastSig = "/"
      lastWord = ""
      i = j
      continue
    }
    if (c === "{") {
      frame.depth++
    } else if (c === "}") {
      if (frame.depth === 0 && stack.length > 1) {
        stack.pop()
        i++
        continue
      }
      frame.depth--
    }
    if (IDENT_CHAR.test(c)) {
      let j = i
      while (j < n && IDENT_CHAR.test(src[j])) j++
      lastWord = src.slice(i, j)
      lastSig = "w"
      i = j
      continue
    }
    if (!/\s/.test(c)) {
      lastSig = c
      lastWord = ""
    }
    i++
  }
  for (const frame of stack) {
    if (frame.kind === "tpl") literals.push({ ...frame.lit, end: n })
  }
  return { code: out.join(""), literals }
}

function computeLineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1)
  return starts
}

function lineAt(sf: SourceFile, offset: number): number {
  let lo = 0
  let hi = sf.lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (sf.lineStarts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function lineText(sf: SourceFile, line: number): string {
  const start = sf.lineStarts[line - 1] ?? 0
  const end = sf.lineStarts[line] ?? sf.text.length
  return sf.text.slice(start, end).trim()
}

const clip = (s: string, max = 90): string => {
  const one = s.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function loadSource(abs: string): SourceFile {
  const text = readFileSync(abs, "utf-8")
  const { code, literals } = lex(text)
  const file = rel(abs)
  return {
    file,
    text,
    code,
    literals,
    lineStarts: computeLineStarts(text),
    isTest: isTestFile(file),
    isClient: isClientModule(text),
  }
}

// ---------------------------------------------------------------------------
// Pengumpulan berkas
// ---------------------------------------------------------------------------

const srcFiles = walk(path.join(ROOT, "src"))
const supabaseFiles = walk(path.join(ROOT, "supabase"))
const rootConfigFiles = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isFile() && CODE_EXT.test(e.name))
  .map((e) => path.join(ROOT, e.name))

const sources = new Map<string, SourceFile>()
for (const abs of [...srcFiles, ...supabaseFiles, ...rootConfigFiles]) {
  if (CODE_EXT.test(abs) && !abs.endsWith(".d.ts")) {
    const sf = loadSource(abs)
    sources.set(sf.file, sf)
  }
}
const srcSources = [...sources.values()].filter((sf) => sf.file.startsWith("src/") && /\.tsx?$/.test(sf.file))

const findings: Finding[] = []
const report = (check: CheckId, file: string, line: number, message: string): void => {
  findings.push({ check, file, line, message })
}

// ---------------------------------------------------------------------------
// 1. orphan-file & test-only (graf import)
// ---------------------------------------------------------------------------

const APP_ENTRY =
  /^src\/app\/(?:.*\/)?(?:page|layout|template|default|loading|error|global-error|not-found|forbidden|unauthorized|route|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest)\.[jt]sx?$/
const SPECIAL_ENTRY = /^(?:src\/)?(?:middleware|proxy|instrumentation|instrumentation-client)\.[jt]s$/

const isProdRoot = (f: string): boolean => APP_ENTRY.test(f) || SPECIAL_ENTRY.test(f) || !f.includes("/")

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\brequire\(\s*["']([^"'\n]+)["']\s*\)/g,
]

function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.join(path.posix.dirname(fromFile), spec)
  else return null
  const candidates = [base, ...RESOLVE_EXT.map((e) => base + e), ...RESOLVE_EXT.map((e) => `${base}/index${e}`)]
  return candidates.find((c) => sources.has(c)) ?? null
}

const edges = new Map<string, Set<string>>()
for (const sf of sources.values()) {
  const deps = new Set<string>()
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    for (const m of sf.code.matchAll(pattern)) {
      const target = resolveSpecifier(sf.file, m[1])
      if (target) deps.add(target)
    }
  }
  edges.set(sf.file, deps)
}

function reachableFrom(roots: string[]): Set<string> {
  const seen = new Set<string>(roots)
  const queue = [...roots]
  while (queue.length > 0) {
    const cur = queue.pop() as string
    for (const dep of edges.get(cur) ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep)
        queue.push(dep)
      }
    }
  }
  return seen
}

const allFiles = [...sources.keys()]
const prodReach = reachableFrom(allFiles.filter(isProdRoot))
const testReach = reachableFrom(allFiles.filter(isTestFile))

for (const sf of srcSources) {
  if (sf.isTest || isProdRoot(sf.file) || prodReach.has(sf.file)) continue
  if (testReach.has(sf.file)) {
    report("test-only", sf.file, 1, "hanya diimpor oleh test; tidak terjangkau dari entrypoint produksi")
  } else {
    report("orphan-file", sf.file, 1, "tidak diimpor dari entrypoint Next.js maupun test")
  }
}

// ---------------------------------------------------------------------------
// 2. prompt-file
// ---------------------------------------------------------------------------

// Impor dinamis berekstensi .ts: Node menjalankan skrip ini dengan type stripping (butuh path berkas
// persis), sedangkan tsc tanpa allowImportingTsExtensions menolak impor statis berakhiran .ts.
const promptBuild = (await import(new URL("./build-prompts.ts", import.meta.url).href)) as typeof PromptRegistryBuild
for (const issue of promptBuild.buildRegistry(ROOT).issues) {
  report("prompt-file", issue.file, issue.line, issue.message)
}

// ---------------------------------------------------------------------------
// 3. hardcoded-prompt
// ---------------------------------------------------------------------------

const PERSONA_PHRASE =
  /\b(?:anda adalah|kamu adalah|bertindak(?:lah)? sebagai|anda bertindak|you are an?|act as an?|your task is|system prompt)\b/i
const CAPS_DIRECTIVE = /\b(?:IMPORTANT|PENTING|DILARANG|WAJIB|JANGAN|HANYA|INSTRUKSI|ATURAN|TUGAS|FORMAT OUTPUT|OUTPUT FORMAT|RULES|MUST|NEVER|ONLY)\b/
const INSTRUCTION_WORD =
  /\b(?:anda|kamu|tulis(?:kan|lah)?|buat(?:kan|lah)?|jangan|dilarang|wajib|harus|keluarkan|hanya|pastikan|gunakan|sajikan|berikan|jawab|kembalikan|instruksi|you|must|never|always|only|respond|return|output|ensure|write)\b/gi
const LLM_CONTEXT = /(?:\bcontent|prompt\w*|instruction\w*|system\w*|messages?)\s*[:=(]\s*\(?\s*$/i

function decodeLiteral(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\(.)/g, "$1")
}

for (const sf of srcSources) {
  if (sf.isTest || sf.isClient || sf.file.startsWith(`${PROMPTS_DIR}/`)) continue
  for (const lit of sf.literals) {
    const text = decodeLiteral(lit.value)
    if (text.trim().length < 40) continue
    const before = sf.code.slice(Math.max(0, lit.start - 80), lit.start)
    const llmContext = LLM_CONTEXT.test(before)
    const instructionWords = new Set((text.match(INSTRUCTION_WORD) ?? []).map((w) => w.toLowerCase()))
    const lineCount = text.split("\n").length
    const looksLikePrompt =
      PERSONA_PHRASE.test(text) ||
      (CAPS_DIRECTIVE.test(text) && (llmContext || text.length >= 120) && instructionWords.size >= 2) ||
      (lineCount >= 4 && text.length >= 200 && instructionWords.size >= 3)
    if (looksLikePrompt) {
      const firstLine = text.split("\n").find((l) => /[A-Za-z]{3}/.test(l.replace(/\$\{…\}/g, ""))) ?? text
      report(
        "hardcoded-prompt",
        sf.file,
        lineAt(sf, lit.start),
        `literal mirip prompt LLM (${lineCount} baris, ${text.length} karakter): "${clip(firstLine, 70)}" — pindahkan ke ${PROMPTS_DIR}/*.md`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 4. legacy-term
// ---------------------------------------------------------------------------

const ENGINE = /engine/gi
const SEARCH_ENGINE_PREFIX = /(?:meta)?search[\s_-]*$/i

for (const sf of srcSources) {
  if (sf.isTest) continue
  if (/engine/i.test(sf.file)) {
    report("legacy-term", sf.file, 1, "nama berkas memuat istilah legacy \"engine\"")
  }
  const flaggedLines = new Set<number>()
  for (const m of sf.code.matchAll(ENGINE)) {
    const idx = m.index ?? 0
    if (SEARCH_ENGINE_PREFIX.test(sf.code.slice(Math.max(0, idx - 16), idx))) continue
    const line = lineAt(sf, idx)
    if (flaggedLines.has(line)) continue
    flaggedLines.add(line)
    report("legacy-term", sf.file, line, `"${clip(lineText(sf, line), 80)}"`)
  }
}

// ---------------------------------------------------------------------------
// 5. arbitrary-color
// ---------------------------------------------------------------------------

const ARBITRARY_COLOR_CLASS = /-\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\()/
const INLINE_STYLE_COLOR =
  /(?:^|[^\w-])(?:color|background(?:Color)?|borderColor|outlineColor|fill|stroke|caretColor|accentColor|textDecorationColor)\s*:\s*["'`](?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()/

for (const sf of srcSources) {
  if (sf.isTest || !/^src\/(?:components|app)\//.test(sf.file)) continue
  sf.code.split("\n").forEach((codeLine, idx) => {
    if (ARBITRARY_COLOR_CLASS.test(codeLine) || INLINE_STYLE_COLOR.test(codeLine)) {
      report("arbitrary-color", sf.file, idx + 1, `"${clip(lineText(sf, idx + 1), 80)}"`)
    }
  })
}

// ---------------------------------------------------------------------------
// 6. raw-fetch
// ---------------------------------------------------------------------------

const RAW_FETCH = /(?:^|[^\w$])fetch\s*\(/g

type UrlClass = { kind: "relative" } | { kind: "fixed"; host: string } | { kind: "dynamic"; expr: string }

function classifyUrlLiteral(lit: Literal): UrlClass {
  const v = lit.value
  if (v.startsWith("/") && !v.startsWith("//")) return { kind: "relative" }
  const m = /^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/.exec(v)
  if (m && !m[1].includes("${")) return { kind: "fixed", host: m[1].toLowerCase() }
  return { kind: "dynamic", expr: `${lit.quote}${clip(v, 40)}${lit.quote}` }
}

function literalAt(sf: SourceFile, offset: number): Literal | undefined {
  return sf.literals.find((l) => l.start === offset)
}

function classifyFetchArg(sf: SourceFile, argStart: number): UrlClass {
  const lit = literalAt(sf, argStart)
  if (lit) return classifyUrlLiteral(lit)
  const ident = /^[A-Za-z_$][\w$]*/.exec(sf.code.slice(argStart))
  if (ident) {
    // Telusuri deklarasi terdekat sebelum pemanggilan: const|let|var <ident> = "<literal>"
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${ident[0].replace(/\$/g, "\\$")}\\s*(?::[^=\\n]+)?=\\s*`, "g")
    let initAt = -1
    for (const m of sf.code.slice(0, argStart).matchAll(decl)) initAt = (m.index ?? 0) + m[0].length
    if (initAt >= 0) {
      const initLit = literalAt(sf, initAt)
      if (initLit) return classifyUrlLiteral(initLit)
    }
    return { kind: "dynamic", expr: ident[0] }
  }
  return { kind: "dynamic", expr: clip(sf.code.slice(argStart, argStart + 40), 40) }
}

function checkRawFetch(allow: Allowlist): void {
  for (const sf of srcSources) {
    // Kode client berjalan di browser (bukan vektor SSRF server); test memakai mock.
    if (sf.isTest || sf.isClient) continue
    for (const m of sf.code.matchAll(RAW_FETCH)) {
      let argStart = (m.index ?? 0) + m[0].length
      while (/\s/.test(sf.code[argStart] ?? "")) argStart++
      const cls = classifyFetchArg(sf, argStart)
      const line = lineAt(sf, argStart)
      if (cls.kind === "relative") continue
      if (cls.kind === "fixed") {
        if (allow.externalHosts.has(cls.host)) continue
        report("raw-fetch", sf.file, line, `host eksternal "${cls.host}" belum terdaftar di externalHosts allowlist`)
      } else {
        report("raw-fetch", sf.file, line, `URL dinamis ${cls.expr} — gunakan safeFetch()/wpFetch`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Allowlist & laporan
// ---------------------------------------------------------------------------

function loadAllowlist(): { allow: Allowlist; errors: string[] } {
  const errors: string[] = []
  const allow: Allowlist = { externalHosts: new Map(), entries: [] }
  if (!existsSync(ALLOWLIST_PATH)) return { allow, errors }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf-8"))
  } catch (err) {
    return { allow, errors: [`allowlist bukan JSON valid: ${(err as Error).message}`] }
  }
  const obj = (raw ?? {}) as { externalHosts?: unknown; entries?: unknown }
  if (obj.externalHosts && typeof obj.externalHosts === "object") {
    for (const [host, reason] of Object.entries(obj.externalHosts as Record<string, unknown>)) {
      if (typeof reason !== "string" || reason.trim() === "") errors.push(`externalHosts["${host}"] wajib berisi alasan`)
      else allow.externalHosts.set(host.toLowerCase(), reason)
    }
  }
  const seen = new Set<string>()
  for (const [idx, e] of (Array.isArray(obj.entries) ? obj.entries : []).entries()) {
    const entry = (e ?? {}) as Partial<Record<keyof AllowEntry, unknown>>
    const where = `entries[${idx}]`
    if (typeof entry.check !== "string" || !(CHECK_IDS as readonly string[]).includes(entry.check)) {
      errors.push(`${where}.check tidak dikenal: ${String(entry.check)}`)
      continue
    }
    if (typeof entry.file !== "string" || entry.file === "") {
      errors.push(`${where}.file wajib diisi`)
      continue
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 10) {
      errors.push(`${where} (${entry.file}) wajib menyertakan reason yang jelas`)
      continue
    }
    if (typeof entry.max !== "number" || !Number.isInteger(entry.max) || entry.max < 1) {
      errors.push(`${where} (${entry.file}) wajib menyertakan max (bilangan bulat ≥ 1)`)
      continue
    }
    const key = `${entry.check}::${entry.file}`
    if (seen.has(key)) errors.push(`${where} duplikat untuk ${key}`)
    seen.add(key)
    allow.entries.push({ check: entry.check as CheckId, file: entry.file, max: entry.max, reason: entry.reason })
  }
  return { allow, errors }
}

const { allow, errors: allowErrors } = loadAllowlist()
checkRawFetch(allow)

const grouped = new Map<string, Finding[]>()
for (const f of findings) {
  const key = `${f.check}::${f.file}`
  const list = grouped.get(key) ?? []
  list.push(f)
  grouped.set(key, list)
}
const allowByKey = new Map(allow.entries.map((e) => [`${e.check}::${e.file}`, e]))

const failures: Finding[] = []
const accepted: Finding[] = []
const notes: string[] = []
for (const [key, list] of grouped) {
  const entry = allowByKey.get(key)
  if (!entry) {
    failures.push(...list)
  } else if (list.length > entry.max) {
    notes.push(`${entry.check} ${entry.file}: ${list.length} temuan melebihi max ${entry.max} di allowlist`)
    failures.push(...list)
  } else {
    accepted.push(...list)
    if (list.length < entry.max) {
      notes.push(`${entry.check} ${entry.file}: temuan turun ke ${list.length} — turunkan max (saat ini ${entry.max})`)
    }
  }
}
const stale = allow.entries.filter((e) => !grouped.has(`${e.check}::${e.file}`))
for (const e of stale) notes.push(`${e.check} ${e.file}: tidak ada temuan lagi — hapus entri allowlist ini`)
for (const host of allow.externalHosts.keys()) {
  const used = srcSources.some((sf) => sf.text.includes(`://${host}`))
  if (!used) notes.push(`externalHosts "${host}" tidak dipakai lagi — hapus dari allowlist`)
}

const byLocation = (a: Finding, b: Finding): number => a.file.localeCompare(b.file) || a.line - b.line

console.log("==================================================")
console.log("  AUDIT KEBERSIHAN CODEBASE PANITERA")
console.log("==================================================")
console.log(`Berkas TS/TSX di src/ dipindai: ${srcSources.length}\n`)

for (const check of CHECK_IDS) {
  const fails = failures.filter((f) => f.check === check).sort(byLocation)
  const oks = accepted.filter((f) => f.check === check).sort(byLocation)
  const status = fails.length > 0 ? "GAGAL" : "OK"
  const okFiles = new Set(oks.map((f) => f.file)).size
  const suffix = oks.length > 0 ? ` (${oks.length} temuan lama di ${okFiles} berkas ter-allowlist)` : ""
  console.log(`[${status}] ${CHECK_TITLES[check]}${suffix}`)
  for (const f of fails) console.log(`   ✗ ${f.file}:${f.line} — ${f.message}`)
  if (VERBOSE) for (const f of oks) console.log(`   · ${f.file}:${f.line} — ${f.message}`)
}

if (notes.length > 0) {
  console.log("\nCatatan allowlist:")
  for (const n of notes) console.log(`   - ${n}`)
}
if (allowErrors.length > 0) {
  console.log("\nAllowlist tidak valid:")
  for (const e of allowErrors) console.log(`   ✗ ${e}`)
}

const staleFail = STRICT && (stale.length > 0 || notes.some((n) => n.includes("turunkan max") || n.includes("tidak dipakai lagi")))
const failed = failures.length > 0 || allowErrors.length > 0 || staleFail
console.log("\n==================================================")
if (failed) {
  console.log(
    `GAGAL: ${failures.length} temuan baru${allowErrors.length > 0 ? `, ${allowErrors.length} kesalahan allowlist` : ""}${staleFail ? ", allowlist basi (--strict)" : ""}.`,
  )
  console.log("Perbaiki temuan, atau (hanya bila benar-benar perlu) tambahkan entri beralasan di scripts/audit-allowlist.json.")
  process.exitCode = 1
} else {
  console.log("LULUS: tidak ada temuan baru di luar allowlist.")
}
