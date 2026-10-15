/**
 * @file scripts/eval-writer.ts
 * @description Eval harness live untuk Agent Profile writer (TIDAK dijalankan di CI). Menjalankan `writer.run()`
 * atas kasus `evals/cases/*.json` (profil bawaan `preset:*`), menilai setiap hasil secara deterministik
 * (`evals/scoring.ts`: sukses, jumlah kata vs target, subbab H2, tanpa H1/byline/sitasi, Markdown murni,
 * content_html aman & blok Gutenberg valid, panjang judul/excerpt, heuristik bahasa, token/durasi/biaya),
 * lalu menulis laporan JSON + Markdown. Pakai sebelum/sesudah mengubah prompt atau model untuk membandingkan.
 *
 * Kode eval (TS dengan alias `@/`) dimuat lewat Vite SSR dari `vitest` (devDependency) memakai konfigurasi
 * `vitest.config.mts`, karena type stripping Node tidak dapat me-resolve alias & impor tanpa ekstensi.
 *
 * @prerequisites
 * - Node.js 22.18+ dan dependensi terpasang (`npm ci`).
 * - Mode live: `EVAL_OPENROUTER_API_KEY` di environment shell. Skrip TIDAK membaca berkas .env dan tidak pernah
 *   mencetak kunci; kunci juga disamarkan dari seluruh berkas laporan. Opsional (mengaktifkan tool riset):
 *   `EVAL_TAVILY_API_KEY`, `EVAL_BRAVE_API_KEY`, `EVAL_SERPAPI_API_KEY`, `EVAL_PEXAFY_API_KEY`.
 * - Tanpa kredensial WordPress: tool yang butuh situs WP (mis. `upload_media`, `set_featured_image`) tidak eligible,
 *   sehingga eval tidak pernah menyentuh WordPress. Tanpa userId: tidak ada query Supabase (skill Deep Agent dilewati).
 * - Biaya: setiap kasus live memanggil LLM berbayar melalui kunci Anda.
 *
 * @usage
 * EVAL_OPENROUTER_API_KEY=… npm run eval:writer
 * npm run eval:writer -- --model <openrouter-model-id> --case quick-monstera-apartemen --case deep-umkm-qris
 * npm run eval:writer -- --profile preset:quick-writer --timeout 300
 * npm run eval:writer -- --dry-run      # tanpa kunci & jaringan: naskah sintetis untuk membuktikan plumbing + penilaian
 *   --model <id>       override model OpenRouter untuk semua kasus (default: resolusi normal writer)
 *   --case <id>        filter kasus (boleh diulang atau dipisah koma)
 *   --profile <ref>    filter profil, mis. preset:research-writer
 *   --timeout <detik>  batas waktu per kasus (default 600)
 *   --out <dir>        folder induk laporan (default .workspaces/evals)
 *
 * @output
 * - <out>/<timestamp>[-dry-run]/report.json, report.md, articles/<kasus>.md
 * - exit 0: semua kasus lulus; 1: ada kasus gagal; 2: argumen/konfigurasi tidak valid.
 */
import { execFileSync } from "node:child_process"
import path from "node:path"
import { parseArgs } from "node:util"
import { createViteServer } from "vitest/node"
import type * as EvalRunner from "../evals/runner"

const ROOT = path.resolve(import.meta.dirname, "..")
const DEFAULT_TIMEOUT_SECONDS = 600

function gitRevision(): string | null {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf-8" }).trim()
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf-8" }).trim() !== ""
    return dirty ? `${sha}-dirty` : sha
  } catch {
    return null
  }
}

function fail(message: string): never {
  console.error(`✗ ${message}\nLihat header scripts/eval-writer.ts untuk cara pakai.`)
  process.exit(2)
}

const env = (name: string): string | undefined => process.env[name]?.trim() || undefined

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      model: { type: "string" },
      case: { type: "string", multiple: true, default: [] },
      profile: { type: "string" },
      timeout: { type: "string", default: String(DEFAULT_TIMEOUT_SECONDS) },
      out: { type: "string", default: ".workspaces/evals" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  })
  if (values.help) {
    console.log("Pemakaian: npm run eval:writer -- [--dry-run] [--model <id>] [--case <id>]… [--profile <ref>] [--timeout <detik>] [--out <dir>]")
    return
  }

  const dryRun = values["dry-run"]
  const openrouterKey = dryRun ? undefined : env("EVAL_OPENROUTER_API_KEY")
  if (!dryRun && !openrouterKey) fail("EVAL_OPENROUTER_API_KEY belum di-set di environment shell (atau pakai --dry-run).")
  const timeoutSeconds = Number(values.timeout)
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30) fail("--timeout wajib bilangan bulat ≥ 30 (detik).")

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outDir = path.resolve(ROOT, values.out, dryRun ? `${stamp}-dry-run` : stamp)

  const server = await createViteServer({
    root: ROOT,
    configFile: path.join(ROOT, "vitest.config.mts"),
    appType: "custom",
    logLevel: "warn",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    const runner = (await server.ssrLoadModule("/evals/runner.ts")) as typeof EvalRunner
    console.log(`Eval writer (${dryRun ? "dry-run, tanpa LLM" : "live"}${values.model ? `, model ${values.model}` : ""})`)
    const { report, reportDir } = await runner.runWriterEvals({
      casesDir: path.join(ROOT, "evals", "cases"),
      outDir,
      dryRun,
      openrouterKey,
      searchKeys: {
        tavilyKey: dryRun ? undefined : env("EVAL_TAVILY_API_KEY"),
        braveKey: dryRun ? undefined : env("EVAL_BRAVE_API_KEY"),
        serpapiKey: dryRun ? undefined : env("EVAL_SERPAPI_API_KEY"),
        pexafyKey: dryRun ? undefined : env("EVAL_PEXAFY_API_KEY"),
      },
      modelOverride: values.model,
      caseIds: values.case.flatMap((c) => c.split(",")).map((c) => c.trim()).filter(Boolean),
      profile: values.profile,
      timeoutSeconds,
      gitRevision: gitRevision(),
      log: (line) => console.log(line),
    })
    const { summary } = report
    console.log(`\n${summary.passed}/${summary.cases} kasus lulus · skor rata-rata ${summary.meanScore}`)
    console.log(`Laporan: ${path.relative(ROOT, reportDir)}/report.md (JSON: report.json)`)
    process.exitCode = summary.failed > 0 ? 1 : 0
  } finally {
    await server.close()
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  const key = env("EVAL_OPENROUTER_API_KEY")
  fail(key ? message.split(key).join("[REDACTED]") : message)
})
