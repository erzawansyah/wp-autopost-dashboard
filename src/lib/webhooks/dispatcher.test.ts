import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { testWebhookEndpoint } from "@/lib/webhooks/dispatcher"
import { signWebhookPayload } from "@/lib/webhooks/signature"

interface CapturedRequest {
  path: string
  headers: http.IncomingHttpHeaders
  body: string
}

describe("testWebhookEndpoint", () => {
  const captured: CapturedRequest[] = []
  let server: http.Server
  let base: string

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk
      })
      req.on("end", () => {
        captured.push({ path: req.url ?? "", headers: req.headers, body })
        if (req.url === "/redirect") {
          res.writeHead(307, { location: "/internal-target" }).end()
        } else if (req.url === "/fail") {
          res.writeHead(500).end("boom")
        } else {
          res.writeHead(200, { "content-type": "application/json" }).end('{"received":true}')
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
    vi.unstubAllEnvs()
  })

  it("memblokir alamat privat secara default dengan pesan generik", async () => {
    const result = await testWebhookEndpoint(`${base}/hook`, "rahasia")
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(result.error).not.toMatch(/127\.0\.0\.1|privat|resolve/i)
    expect(captured).toHaveLength(0)
  })

  describe("dengan ALLOW_PRIVATE_NETWORK_FETCH (khusus dev/test)", () => {
    beforeAll(() => {
      vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    })

    it("mengirim header timestamp + signature atas `${timestamp}.${rawBody}`", async () => {
      const before = Math.floor(Date.now() / 1000)
      const result = await testWebhookEndpoint(`${base}/hook`, "rahasia")
      expect(result).toMatchObject({ ok: true, status: 200 })

      const request = captured.at(-1)
      expect(request?.path).toBe("/hook")
      const timestamp = Number(request?.headers["x-panitera-timestamp"])
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(request?.headers["x-panitera-signature"]).toBe(
        `sha256=${signWebhookPayload("rahasia", timestamp, request?.body ?? "")}`
      )
      expect(request?.headers["x-webhook-event"]).toBe("test.ping")
      expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ event: "test.ping" })
    })

    it("tidak mengikuti redirect", async () => {
      captured.length = 0
      const result = await testWebhookEndpoint(`${base}/redirect`, "rahasia")
      expect(result.ok).toBe(false)
      expect(captured.map((r) => r.path)).toEqual(["/redirect"])
    })

    it("melaporkan status HTTP non-2xx dari penerima", async () => {
      const result = await testWebhookEndpoint(`${base}/fail`, "rahasia")
      expect(result).toMatchObject({ ok: false, status: 500 })
    })

    it("menolak secret kosong tanpa mengirim request", async () => {
      captured.length = 0
      const result = await testWebhookEndpoint(`${base}/hook`, "")
      expect(result.ok).toBe(false)
      expect(captured).toHaveLength(0)
    })
  })
})
