/**
 * Redaksi kredensial untuk log eksekusi, telemetri, dan respons API.
 *
 * Dipakai sebelum payload yang mungkin memuat kredensial terdekripsi (Application Password
 * WordPress, API key BYOK, token) ditulis ke `nodeLogs` / `execution_logs` atau dikirim ke browser.
 * Fungsi ini murni (tidak memutasi input) dan aman terhadap referensi sirkular.
 *
 * Pola teks sengaja sempit agar konten biasa tidak rusak: "Basic Training", URL gambar dengan
 * `?token=abc`, atau properti struktural seperti `primaryKey` tidak disamarkan. Untuk konten artikel
 * (judul, isi, URL gambar) jangan jalankan redaksi menyeluruh; redaksi hanya jalur yang memang
 * membawa kredensial (request/site/log), lihat route Lab.
 */

export const REDACTED = "[REDACTED]"

const MAX_DEPTH = 12

/** Nama key (dinormalisasi: huruf kecil, tanpa `_`/`-`/spasi) yang selalu dianggap rahasia. */
const SENSITIVE_EXACT_KEYS = new Set(["auth", "pass", "pwd", "cookie", "setcookie"])

/** Akhiran nama key yang dianggap rahasia, mis. `apiKey`, `openrouterKey`, `clientSecret`, `accessToken`. */
const SENSITIVE_KEY_SUFFIXES = [
  "key",
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "authorization",
  "credential",
  "credentials",
]

/**
 * Nama berakhiran `key` yang lazim di data struktural dan bukan kredensial. Daftar ini sengaja
 * eksplisit (bukan pola) agar nama tak dikenal seperti `fooKey` tetap disamarkan (aman secara default).
 */
const NON_SECRET_KEY_NAMES = new Set([
  "primarykey",
  "foreignkey",
  "publickey",
  "cachekey",
  "sortkey",
  "partitionkey",
  "idempotencykey",
  "dedupekey",
  "querykey",
  "storagekey",
  "lookupkey",
  "groupkey",
  "rowkey",
  "i18nkey",
  "translationkey",
  "hotkey",
])

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, "")
}

/** `true` bila nama properti menandakan nilai kredensial/rahasia. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  if (!normalized) return false
  if (SENSITIVE_EXACT_KEYS.has(normalized)) return true
  if (NON_SECRET_KEY_NAMES.has(normalized)) return false
  return SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

/** Karakter token (base64/base64url, hex, JWT, API key berprefiks). */
const TOKEN_CHAR = "[A-Za-z0-9._~+/=-]"

/**
 * Header/field `Authorization` (dengan atau tanpa skema): nilainya selalu rahasia.
 * Contoh: `Authorization: Bearer xxx`, `"authorization":"Basic xxx"`, `authorization=xxx`.
 */
const AUTHORIZATION_FIELD_PATTERN =
  /(\bAuthorization["']?\s*[:=]\s*["']?)(?:(Bearer|Basic|Token|Digest)\s+)?[^\s"',;}]+/gi

/**
 * Skema `Bearer`/`Basic` tanpa prefiks header hanya disamarkan bila nilainya menyerupai token:
 * minimal 16 karakter token dan memuat angka. "Basic Training" atau "bearer of bad news" tidak tersentuh.
 */
const AUTH_SCHEME_TOKEN_PATTERN = new RegExp(
  `\\b(Bearer|Basic)\\s+(?=${TOKEN_CHAR}*\\d)${TOKEN_CHAR}{16,}`,
  "gi"
)

/** Parameter query yang namanya jelas rahasia: nilainya selalu disamarkan. */
const SECRET_QUERY_PARAM_PATTERN =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password|passwd)=)[^&\s"'#]+/gi

/**
 * Nama parameter generik (`key`, `token`) dipakai juga untuk hal non-rahasia (mis. URL gambar CDN
 * bertanda tangan pendek), jadi hanya disamarkan bila nilainya panjang menyerupai kredensial
 * (minimal 16 karakter dan memuat angka).
 */
const GENERIC_SECRET_QUERY_PARAM_PATTERN = /([?&](?:key|token)=)(?=[^&\s"'#]*\d)[^&\s"'#]{16,}/gi

/**
 * Menyamarkan rahasia yang terselip di dalam teks bebas (pesan error, URL, ringkasan log),
 * mis. `Authorization: Bearer xxx`, `?api_key=xxx`, atau `?key=<token panjang>`.
 */
export function redactSecretsInText(text: string): string {
  return text
    .replace(AUTHORIZATION_FIELD_PATTERN, (_match, prefix: string, scheme: string | undefined) =>
      scheme ? `${prefix}${scheme} ${REDACTED}` : `${prefix}${REDACTED}`
    )
    .replace(AUTH_SCHEME_TOKEN_PATTERN, `$1 ${REDACTED}`)
    .replace(SECRET_QUERY_PARAM_PATTERN, `$1${REDACTED}`)
    .replace(GENERIC_SECRET_QUERY_PARAM_PATTERN, `$1${REDACTED}`)
}

export interface RedactOptions {
  /**
   * `false`: hanya properti bernama rahasia yang disamarkan; string lain tidak dipindai pola teks.
   * Dipakai untuk keluaran terstruktur (mis. hasil tool) yang memuat URL/konten apa adanya.
   * Default `true`.
   */
  scanText?: boolean
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>, scanText: boolean): unknown {
  if (typeof value === "string") return scanText ? redactSecretsInText(value) : value
  if (value === null || typeof value !== "object") {
    // Fungsi tidak dapat diserialisasi dan tidak relevan untuk log.
    return typeof value === "function" ? undefined : value
  }
  if (value instanceof Date) return value
  if (seen.has(value)) return "[Circular]"
  if (depth >= MAX_DEPTH) return "[Truncated]"
  seen.add(value)

  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, depth + 1, seen, scanText))
    }

    if (value instanceof Error) {
      // Pesan error selalu dipindai: sering memuat URL request/header mentah.
      return { name: value.name, message: redactSecretsInText(value.message) }
    }

    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "function") continue
      if (isSensitiveKey(key)) {
        // Pertahankan informasi "kosong vs terisi" tanpa membocorkan nilainya.
        result[key] = entry === undefined || entry === null || entry === "" ? entry : REDACTED
        continue
      }
      result[key] = redactValue(entry, depth + 1, seen, scanText)
    }
    return result
  } finally {
    seen.delete(value)
  }
}

/** Deep-redaction untuk nilai apa pun (objek, array, string). Tidak memutasi input. */
export function redactSecrets(value: unknown, options: RedactOptions = {}): unknown {
  return redactValue(value, 0, new WeakSet(), options.scanText !== false)
}

/** Varian `redactSecrets` untuk record, mempertahankan bentuk `Record<string, unknown>`. */
export function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactSecrets(value)
  return redacted !== null && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {}
}
