import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { SsrfBlockedError } from "@/lib/net/safe-fetch"
import {
  createWordPressCategory,
  createWordPressPost,
  describeWpNetworkError,
  fetchWordPressCategories,
  fetchWordPressPostRawContent,
  fetchWordPressUsers,
  isValidWpPostId,
  normalizeAndValidateWpUrl,
  resolveOrCreateWordPressTags,
  testWordPressConnection,
  updateWordPressPostContent,
  wpFetch,
} from "@/lib/wordpress/client"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("normalizeAndValidateWpUrl", () => {
  it("menormalkan domain tanpa skema menjadi https dan membuang trailing slash", () => {
    expect(normalizeAndValidateWpUrl(" example.com/blog/ ")).toEqual({
      valid: true,
      normalizedUrl: "https://example.com/blog",
    })
  })

  it.each([
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f.1",
    "http://[::1]:8080",
    "http://[::ffff:127.0.0.1]",
    "http://10.1.2.3",
    "http://172.16.0.10",
    "http://192.168.1.10",
    "http://169.254.169.254",
    "http://0.0.0.0",
    "http://[fd00::1]",
    "http://[fe80::1]",
    "http://localhost:8080",
    "http://wp.localhost",
    "http://metadata.google.internal",
  ])("menolak %s di semua environment", (url) => {
    expect(normalizeAndValidateWpUrl(url).valid).toBe(false)
  })

  it("menolak kredensial di URL", () => {
    expect(normalizeAndValidateWpUrl("https://admin:secret@example.com").valid).toBe(false)
  })

  it("mengizinkan jaringan privat hanya dengan ALLOW_PRIVATE_NETWORK_FETCH di luar production", () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    expect(normalizeAndValidateWpUrl("http://localhost:8881").valid).toBe(true)
    expect(normalizeAndValidateWpUrl("http://192.168.1.10").valid).toBe(true)

    vi.stubEnv("NODE_ENV", "production")
    expect(normalizeAndValidateWpUrl("https://192.168.1.10").valid).toBe(false)
  })

  it("mewajibkan https di production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(normalizeAndValidateWpUrl("http://example.com").valid).toBe(false)
    expect(normalizeAndValidateWpUrl("https://example.com").valid).toBe(true)
  })
})

describe("describeWpNetworkError", () => {
  it("tidak meneruskan detail penolakan SSRF ke pengguna", () => {
    const message = describeWpNetworkError(new SsrfBlockedError("Host wp.corp mengarah ke jaringan privat/lokal."), "x")
    expect(message).not.toContain("wp.corp")
  })

  it("menyertakan kode jaringan undici dari err.cause tanpa pesan cause (alamat internal)", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:443"), { code: "ECONNREFUSED" })
    const err = new TypeError("fetch failed", { cause })

    const message = describeWpNetworkError(err, "x")

    expect(message).toBe("fetch failed (ECONNREFUSED)")
    expect(message).not.toContain("10.0.0.5")
  })

  it("mengabaikan kode cause yang tidak berbentuk kode jaringan dan tidak menggandakan kode", () => {
    expect(describeWpNetworkError(new TypeError("fetch failed", { cause: { code: "rahasia lain" } }), "x")).toBe(
      "fetch failed"
    )
    const duplicated = new Error("getaddrinfo ENOTFOUND blog.test", { cause: { code: "ENOTFOUND" } })
    expect(describeWpNetworkError(duplicated, "x")).toBe("getaddrinfo ENOTFOUND blog.test")
    expect(describeWpNetworkError("bukan error", "cadangan")).toBe("cadangan")
  })

  it("koneksi yang benar-benar ditolak menghasilkan pesan berkode dari fetch Node", async () => {
    const server = http.createServer()
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const port = (server.address() as AddressInfo).port
    await new Promise<void>((resolve) => server.close(() => resolve()))

    const err = await fetch(`http://127.0.0.1:${port}/`).then(
      () => null,
      (error: unknown) => error
    )

    expect(describeWpNetworkError(err, "x")).toMatch(/^fetch failed \(ECONNREFUSED\)$/)
  })
})

describe("wpFetch", () => {
  const hits: Array<{ method: string; path: string; auth?: string }> = []
  let server: http.Server
  let base: string

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push({ method: req.method ?? "", path: req.url ?? "", auth: req.headers.authorization })
      if (req.url === "/redirect") {
        res.writeHead(301, { location: "/target" }).end()
      } else if (req.url === "/wp-json/wp/v2/users/me") {
        res.writeHead(200, { "content-type": "application/json" }).end('{"id":1,"name":"Editor","slug":"editor"}')
      } else {
        res.writeHead(200, { "content-type": "application/json" }).end("{}")
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
  })

  it("memblokir host privat secara default", async () => {
    await expect(wpFetch(`${base}/wp-json/`)).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(hits).toHaveLength(0)
  })

  it("GET boleh mengikuti redirect, POST tidak", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    const getRes = await wpFetch(`${base}/redirect`)
    expect(getRes.url).toBe(`${base}/target`)

    hits.length = 0
    await expect(wpFetch(`${base}/redirect`, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(hits.map((h) => h.path)).toEqual(["/redirect"])
  })

  it("testWordPressConnection memakai jalur yang sama (Anti-SSRF)", async () => {
    const blocked = await testWordPressConnection({ baseUrl: base, username: "u", applicationPassword: "p" })
    expect(blocked.ok).toBe(false)

    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    const ok = await testWordPressConnection({ baseUrl: base, username: "u", applicationPassword: "p" })
    expect(ok).toEqual({ ok: true, user: { id: 1, name: "Editor", slug: "editor" } })
  })
})

describe("operasi konten & taksonomi WordPress", () => {
  const requests: Array<{ method: string; path: string; body: string }> = []
  let server: http.Server
  let creds: { baseUrl: string; username: string; applicationPassword: string }

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ""
      req.on("data", (chunk) => (body += chunk))
      req.on("end", () => {
        const path = req.url ?? ""
        requests.push({ method: req.method ?? "", path, body })
        const json = (status: number, data: unknown) =>
          res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(data))

        if (path.startsWith("/wp-json/wp/v2/tags?search=")) {
          // WordPress mengembalikan nama term ter-escape
          return json(200, path.includes("Kopi%20%26%20Teh") ? [{ id: 5, name: "Kopi &amp; Teh" }] : [])
        }
        if (path === "/wp-json/wp/v2/tags") return json(201, { id: 99 })
        if (path === "/wp-json/wp/v2/categories") return json(201, { id: 12, name: "Kat", slug: "kat" })
        if (path === "/wp-json/wp/v2/posts") return json(201, { id: 77, link: "https://contoh.test/?p=77", status: "draft" })
        if (path.startsWith("/wp-json/wp/v2/posts/42?")) {
          return json(200, { id: 42, content: { raw: "<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->", rendered: "<p>x</p>" } })
        }
        if (path.startsWith("/wp-json/wp/v2/posts/404?")) return json(404, { code: "rest_post_invalid_id" })
        if (path.startsWith("/wp-json/wp/v2/users?") && path.includes("has_published_posts=true")) {
          return json(200, [{ id: 2, name: "Rina", slug: "rina", description: "Barista" }])
        }
        // Endpoint lambat untuk menguji pembatalan request yang sedang berjalan.
        if (path.startsWith("/wp-json/wp/v2/users?")) {
          setTimeout(() => (res.destroyed ? undefined : json(200, [])), 3_000)
          return
        }
        return json(200, {})
      })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    creds = {
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      username: "u",
      applicationPassword: "p",
    }
  })

  afterAll(() => {
    server.close()
  })

  afterEach(() => {
    requests.length = 0
  })

  it("judul & excerpt di-encode tepat sekali saat dikirim ke WordPress (nilai polos maupun lama yang ter-encode)", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    for (const title of ['Film "Dilan" <2025>', "Film &quot;Dilan&quot; &lt;2025&gt;"]) {
      const result = await createWordPressPost({
        ...creds,
        post: { title, content: "<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->", excerpt: "a > b" },
      })
      expect(result.ok).toBe(true)
      const sent = JSON.parse(requests.at(-1)?.body ?? "{}") as { title: string; excerpt: string }
      expect(sent.title).toBe("Film &quot;Dilan&quot; &lt;2025&gt;")
      expect(sent.excerpt).toBe("a &gt; b")
    }
  })

  it("nama tag dibersihkan dari HTML, dideduplikasi, dan dicocokkan dengan nama ter-escape WordPress", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    const ids = await resolveOrCreateWordPressTags({
      ...creds,
      tagNames: ["Kopi &amp; Teh", "<script>alert(1)</script><b>Seduh</b>", "seduh", "   "],
    })

    expect(ids).toEqual([5, 99])
    const created = requests.filter((r) => r.method === "POST")
    expect(created.map((r) => JSON.parse(r.body))).toEqual([{ name: "Seduh" }])
  })

  it("sinyal pembatalan run: request users/kategori/tag tidak dikirim bila sudah batal", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    const aborted = AbortSignal.abort()

    expect(await fetchWordPressUsers({ ...creds, signal: aborted })).toMatchObject({ ok: false })
    expect(await fetchWordPressCategories({ ...creds, signal: aborted })).toMatchObject({ ok: false })
    expect(await resolveOrCreateWordPressTags({ ...creds, tagNames: ["Kopi"], signal: aborted })).toEqual([])
    expect(requests).toEqual([])
  })

  it("sinyal pembatalan memutus request users yang sedang berjalan (digabung dengan timeout)", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    const controller = new AbortController()
    const started = Date.now()
    setTimeout(() => controller.abort(), 50)

    const result = await fetchWordPressUsers({ ...creds, signal: controller.signal })

    expect(result.ok).toBe(false)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it("publishedAuthorsOnly: hanya user yang sudah menerbitkan post (has_published_posts + who=authors)", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    const result = await fetchWordPressUsers({ ...creds, publishedAuthorsOnly: true })

    expect(result).toMatchObject({ ok: true, users: [{ id: 2, name: "Rina", slug: "rina", description: "Barista" }] })
    expect(requests[0].path).toBe(
      "/wp-json/wp/v2/users?per_page=100&_fields=id,name,slug,description,avatar_urls&has_published_posts=true&who=authors"
    )
  })

  it("nama & deskripsi kategori dikirim sebagai teks polos", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    const result = await createWordPressCategory({
      ...creds,
      name: "<img src=x onerror=alert(1)>Minuman",
      description: "Arsip <a href='javascript:alert(1)'>minuman</a> segar",
    })

    expect(result.ok).toBe(true)
    expect(JSON.parse(requests[0].body)).toEqual({ name: "Minuman", description: "Arsip minuman segar" })

    const empty = await createWordPressCategory({ ...creds, name: "<b></b>" })
    expect(empty.ok).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it("konten mentah diambil via context=edit (content.raw, bukan rendered)", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    const result = await fetchWordPressPostRawContent({ ...creds, postId: 42 })

    expect(result).toEqual({ ok: true, rawContent: "<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->" })
    expect(requests[0].path).toBe("/wp-json/wp/v2/posts/42?context=edit&_fields=id,content")

    const missing = await fetchWordPressPostRawContent({ ...creds, postId: 404 })
    expect(missing).toMatchObject({ ok: false, status: 404 })
  })

  it("ID post tidak sah ditolak tanpa request jaringan", async () => {
    vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")

    for (const postId of [0, -1, 1.5, Number.NaN, 2 ** 60]) {
      expect(isValidWpPostId(postId)).toBe(false)
      expect((await fetchWordPressPostRawContent({ ...creds, postId })).ok).toBe(false)
      expect((await updateWordPressPostContent({ ...creds, postId, content: "x" })).ok).toBe(false)
    }
    expect(isValidWpPostId("42")).toBe(false)
    expect(requests).toHaveLength(0)
  })
})
