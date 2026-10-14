import dns from "node:dns"
import net from "node:net"
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici"

/**
 * Safe outbound fetch untuk URL yang berasal dari pengguna atau LLM (Anti-SSRF).
 *
 * Lapisan perlindungan:
 * 1. Hanya protokol http/https.
 * 2. Host berupa IP literal dicek langsung; host berupa nama dicek saat koneksi
 *    dibuat (DNS lookup di-pin lewat undici Agent), sehingga DNS rebinding ikut tertutup.
 * 3. Redirect ditangani manual dan setiap hop divalidasi ulang (default maks 3 hop).
 * 4. Timeout dan batas ukuran body.
 *
 * Satu-satunya pengecualian jaringan internal: endpoint `/search` dan `/autocompleter`
 * pada SearXNG milik platform (`SEARXNG_URL`), dan hanya bila pemanggil meminta
 * `{ platformSearxng: true }`. Path lain di origin itu (mis. `/image_proxy`) tetap diblokir.
 * Akses jaringan privat hanya bisa dibuka di luar production lewat
 * `ALLOW_PRIVATE_NETWORK_FETCH=true` (misalnya uji WordPress lokal).
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SsrfBlockedError"
  }
}

export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Ukuran respons melebihi batas ${maxBytes} byte.`)
    this.name = "ResponseTooLargeError"
  }
}

const DEFAULT_SEARXNG_URL = "http://searxng-internal:8080"
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

const BLOCKED_RANGES = new net.BlockList()
for (const [prefix, bits] of [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local & metadata cloud
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  BLOCKED_RANGES.addSubnet(prefix, bits, "ipv4")
}
for (const [prefix, bits] of [
  ["::", 96], // unspecified, loopback & IPv4-compatible (deprecated)
  ["::ffff:0:0:0", 96], // IPv4-translated
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo (bisa membungkus IPv4 privat)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (bisa membungkus IPv4 privat)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  BLOCKED_RANGES.addSubnet(prefix, bits, "ipv6")
}

/** Ambil IPv4 yang tertanam di IPv6 (IPv4-mapped `::ffff:a.b.c.d` atau NAT64 `64:ff9b::/96`). */
function embeddedIpv4(ipv6: string): string | null {
  const lower = ipv6.toLowerCase()
  const dotted = lower.match(/^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) return dotted[1]
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".")
  }
  return null
}

/** true jika alamat IP termasuk jaringan privat, loopback, link-local, reserved, atau multicast. */
export function isBlockedIp(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "")
  const family = net.isIP(ip)
  if (family === 4) return BLOCKED_RANGES.check(ip, "ipv4")
  if (family === 6) {
    const v4 = embeddedIpv4(ip)
    if (v4) return BLOCKED_RANGES.check(v4, "ipv4")
    return BLOCKED_RANGES.check(ip, "ipv6")
  }
  return true // bukan IP valid → anggap tidak aman
}

/**
 * Kebijakan tunggal akses jaringan privat: hanya di luar production dan bila
 * `ALLOW_PRIVATE_NETWORK_FETCH=true` (mis. uji WordPress lokal). Dipakai juga oleh validator URL WordPress.
 */
export function isPrivateNetworkAllowed(): boolean {
  return process.env.ALLOW_PRIVATE_NETWORK_FETCH === "true" && process.env.NODE_ENV !== "production"
}

/** Origin SearXNG milik platform (`SEARXNG_URL` + default Docker). Bukan daftar izin umum. */
export function getTrustedInternalOrigins(): Set<string> {
  const origins = new Set<string>()
  for (const raw of [process.env.SEARXNG_URL, DEFAULT_SEARXNG_URL]) {
    if (!raw) continue
    try {
      origins.add(new URL(raw).origin)
    } catch {
      // abaikan nilai env yang tidak valid
    }
  }
  return origins
}

const PLATFORM_SEARXNG_PATHS = new Set(["/search", "/autocompleter"])

/** true hanya untuk endpoint pencarian SearXNG platform; path lain di origin yang sama tidak dipercaya. */
export function isPlatformSearxngEndpoint(input: string | URL): boolean {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return false
  }
  return (
    getTrustedInternalOrigins().has(url.origin) &&
    PLATFORM_SEARXNG_PATHS.has(url.pathname) &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  )
}

/**
 * Normalisasi base URL SearXNG (kustom atau default) sebelum ditambah `/search`/`/autocompleter`.
 * Menolak query string, fragment, dan kredensial agar path tujuan tidak bisa dibelokkan.
 */
export function toSearxngBaseUrl(raw: string): string {
  const url = parseHttpUrl(raw.trim())
  if (url.search || url.hash) {
    throw new SsrfBlockedError("URL SearXNG tidak boleh memuat query string atau fragment.")
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
}

function parseHttpUrl(input: string | URL): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new SsrfBlockedError("Format URL tidak valid.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("Hanya URL http atau https yang diizinkan.")
  }
  if (url.username || url.password) {
    throw new SsrfBlockedError("URL tidak boleh memuat kredensial.")
  }
  return url
}

function assertLiteralHostAllowed(url: URL): void {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host) && isBlockedIp(host)) {
    throw new SsrfBlockedError("Akses ke alamat jaringan privat/lokal diblokir.")
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new SsrfBlockedError("Akses ke host internal diblokir.")
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number
) => void

function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, [])
    const list = addresses as dns.LookupAddress[]
    if (list.length === 0) return callback(new SsrfBlockedError(`Host ${hostname} tidak dapat di-resolve.`), [])
    if (list.some((entry) => isBlockedIp(entry.address))) {
      return callback(new SsrfBlockedError(`Host ${hostname} mengarah ke jaringan privat/lokal.`), [])
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

const guardedAgent = new Agent({ connect: { lookup: safeLookup } })

/**
 * Validasi URL sebelum disimpan (mis. webhook, SearXNG kustom, situs WordPress):
 * protokol, kredensial, IP literal, dan seluruh alamat hasil resolve DNS.
 */
export async function assertSafeUrl(input: string | URL): Promise<URL> {
  const url = parseHttpUrl(input)
  if (isPrivateNetworkAllowed()) return url
  assertLiteralHostAllowed(url)
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (!net.isIP(host)) {
    let addresses: dns.LookupAddress[]
    try {
      addresses = await dns.promises.lookup(host, { all: true, verbatim: true })
    } catch {
      throw new SsrfBlockedError(`Host ${host} tidak dapat di-resolve.`)
    }
    if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
      throw new SsrfBlockedError(`Host ${host} mengarah ke jaringan privat/lokal.`)
    }
  }
  return url
}

export interface SafeFetchOptions {
  /** Timeout total termasuk seluruh redirect (ms). Default 15000. */
  timeoutMs?: number
  /** Maksimal hop redirect yang diikuti. Default 3; 0 = jangan ikuti redirect. */
  maxRedirects?: number
  /** Batas ukuran body respons (byte). Default 10 MB. */
  maxBytes?: number
  /**
   * Izinkan endpoint `/search` & `/autocompleter` SearXNG milik platform (jaringan internal Docker).
   * Hanya untuk helper pencarian SearXNG; jangan dipakai untuk URL umum dari pengguna/LLM.
   */
  platformSearxng?: boolean
}

/** Header yang aman dibawa ke origin lain saat mengikuti redirect. */
const CROSS_ORIGIN_SAFE_HEADERS = ["accept", "accept-language", "user-agent", "content-type"]

function limitBody(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let received = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength
        if (received > maxBytes) {
          controller.error(new ResponseTooLargeError(maxBytes))
          return
        }
        controller.enqueue(chunk)
      },
    })
  )
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])

/**
 * Pengganti `fetch()` untuk URL yang tidak sepenuhnya dikendalikan platform.
 * Mengembalikan `Response` standar; body dibatasi `maxBytes`.
 */
export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal

  let url = parseHttpUrl(input)
  let method = (init.method ?? "GET").toUpperCase()
  let body = init.body
  const headers = new Headers(init.headers)

  for (let hop = 0; ; hop++) {
    const trusted = (options.platformSearxng === true && isPlatformSearxngEndpoint(url)) || isPrivateNetworkAllowed()
    if (!trusted) assertLiteralHostAllowed(url)

    const response = await undiciFetch(url, {
      method,
      headers,
      body: body as UndiciRequestInit["body"],
      redirect: "manual",
      signal,
      dispatcher: trusted ? undefined : guardedAgent,
    })

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location")
      await response.body?.cancel()
      if (!location) throw new SsrfBlockedError("Redirect tanpa header Location.")
      if (hop >= maxRedirects) throw new SsrfBlockedError(`Terlalu banyak redirect (maks ${maxRedirects}).`)
      const next = parseHttpUrl(new URL(location, url))
      if (next.origin !== url.origin) {
        // Lintas origin: buang semua header kecuali allowlist (Authorization, Cookie, API key kustom, dll.)
        for (const name of [...headers.keys()]) {
          if (!CROSS_ORIGIN_SAFE_HEADERS.includes(name)) headers.delete(name)
        }
      }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
        method = "GET"
        body = undefined
        headers.delete("content-type")
        headers.delete("content-length")
      }
      url = next
      continue
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "")
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel()
      throw new ResponseTooLargeError(maxBytes)
    }

    const hasBody = response.body !== null && !NULL_BODY_STATUSES.has(response.status)
    const limited = hasBody ? limitBody(response.body as ReadableStream<Uint8Array>, maxBytes) : null
    const result = new Response(limited, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers as unknown as HeadersInit),
    })
    Object.defineProperty(result, "url", { value: url.toString() })
    return result
  }
}
