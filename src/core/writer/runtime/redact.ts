/**
 * Redaksi kredensial untuk log eksekusi, telemetri, dan respons API.
 *
 * Dipakai sebelum payload yang mungkin memuat kredensial terdekripsi (Application Password
 * WordPress, API key BYOK, token) ditulis ke `nodeLogs` / `execution_logs` atau dikirim ke browser.
 * Fungsi ini murni (tidak memutasi input) dan aman terhadap referensi sirkular.
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

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]/g, "")
}

/** `true` bila nama properti menandakan nilai kredensial/rahasia. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  if (!normalized) return false
  if (SENSITIVE_EXACT_KEYS.has(normalized)) return true
  return SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const SECRET_QUERY_PARAM_PATTERN =
  /([?&](?:api[_-]?key|apikey|key|token|access[_-]?token|password|secret)=)[^&\s"'#]+/gi

/**
 * Menyamarkan rahasia yang terselip di dalam teks bebas (pesan error, URL),
 * mis. `Authorization: Bearer xxx` atau `?api_key=xxx`.
 */
export function redactSecretsInText(text: string): string {
  return text
    .replace(AUTH_SCHEME_PATTERN, `$1 ${REDACTED}`)
    .replace(SECRET_QUERY_PARAM_PATTERN, `$1${REDACTED}`)
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactSecretsInText(value)
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
      return value.map((item) => redactValue(item, depth + 1, seen))
    }

    if (value instanceof Error) {
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
      result[key] = redactValue(entry, depth + 1, seen)
    }
    return result
  } finally {
    seen.delete(value)
  }
}

/** Deep-redaction untuk nilai apa pun (objek, array, string). Tidak memutasi input. */
export function redactSecrets(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet())
}

/** Varian `redactSecrets` untuk record, mempertahankan bentuk `Record<string, unknown>`. */
export function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactSecrets(value)
  return redacted !== null && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {}
}
