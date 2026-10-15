import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { E2E_PATHS, PHP_VERSION, PLAYGROUND_CLI_VERSION, WP_PORT, WP_URL, WP_VERSION } from "../config"
import { assertPortFree, startProcess, waitForHttp, type ManagedProcess } from "./processes"

/**
 * WordPress sekali pakai via `@wp-playground/cli` (SQLite, situs di direktori sementara per run): blueprint `e2e/wordpress/blueprint.json`
 * menyiapkan `WP_ENVIRONMENT_TYPE=local` (Application Password di HTTP), permalink, kategori contoh, lalu membuat
 * Application Password admin lewat API resmi WordPress dan menuliskannya ke `/e2e-state` — direktori host
 * di-ignore Git yang di-mount di luar docroot (tidak dapat diakses lewat HTTP).
 */

export interface WordPressInstance {
  process: ManagedProcess
  url: string
  username: string
  appPassword: string
}

const BOOT_TIMEOUT_MS = 5 * 60_000

function playgroundEnv(tmpDir: string): NodeJS.ProcessEnv {
  // Playground menyalin situs WordPress (~180 MB) ke os.tmpdir() dan tidak selalu membersihkannya saat
  // dihentikan; TMPDIR khusus E2E dihapus harness saat start & teardown.
  const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: tmpDir }
  // Fetch bawaan Node tidak membaca HTTPS_PROXY; Playground mengunduh WordPress & plugin SQLite saat boot.
  if (env.HTTPS_PROXY || env.https_proxy) env.NODE_USE_ENV_PROXY = "1"
  return env
}

function readCredentials(file: string): { username: string; appPassword: string } | null {
  if (!existsSync(file)) return null
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { username?: unknown; appPassword?: unknown }
  if (typeof parsed.username !== "string" || typeof parsed.appPassword !== "string") return null
  return { username: parsed.username, appPassword: parsed.appPassword }
}

export async function startWordPress(): Promise<WordPressInstance> {
  await assertPortFree(WP_PORT, "WordPress Playground")
  rmSync(E2E_PATHS.wordpressState, { recursive: true, force: true })
  mkdirSync(E2E_PATHS.wordpressState, { recursive: true })
  const credentialsFile = path.join(E2E_PATHS.wordpressState, "credentials.json")
  const tmpDir = E2E_PATHS.wordpressTmp
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  const server = startProcess(
    "WordPress Playground",
    "npx",
    [
      "--yes",
      `@wp-playground/cli@${PLAYGROUND_CLI_VERSION}`,
      "server",
      `--port=${WP_PORT}`,
      `--php=${PHP_VERSION}`,
      `--wp=${WP_VERSION}`,
      `--blueprint=${E2E_PATHS.blueprint}`,
      `--mount-before-install=${E2E_PATHS.wordpressState}:/e2e-state`,
    ],
    { cwd: E2E_PATHS.root, env: playgroundEnv(tmpDir), logFile: path.join(E2E_PATHS.logs, "wordpress.log") }
  )
  const wp: ManagedProcess = {
    ...server,
    async stop() {
      await server.stop()
      rmSync(tmpDir, { recursive: true, force: true })
    },
  }

  try {
    // Blueprint selesai → berkas kredensial ada; server siap → REST API menjawab 200.
    await waitForHttp(`${WP_URL}/wp-json/`, {
      timeoutMs: BOOT_TIMEOUT_MS,
      process: wp,
      ready: (response) => response.ok && existsSync(credentialsFile),
    })
    const credentials = readCredentials(credentialsFile)
    if (!credentials) throw new Error(`Blueprint tidak menghasilkan kredensial di ${credentialsFile}.`)
    // Kredensial sudah ada di memori proses; berkas sementara tidak perlu dibiarkan di disk.
    rmSync(credentialsFile, { force: true })

    const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.appPassword}`).toString("base64")}`
    await waitForHttp(`${WP_URL}/wp-json/wp/v2/users/me?context=edit`, {
      timeoutMs: 30_000,
      process: wp,
      headers: { Authorization: authorization },
    })
    return { process: wp, url: WP_URL, ...credentials }
  } catch (error) {
    await wp.stop()
    throw error
  }
}
