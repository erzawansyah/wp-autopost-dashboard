import { describe, expect, it } from "vitest"
import nextConfig from "../../../next.config"
import { SECURITY_HEADERS } from "./security-headers"

describe("header keamanan HTTP", () => {
  it("anti-clickjacking, nosniff, referrer, dan izin perangkat minimal", () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key, value]))).toEqual({
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    })
  })

  it("next.config memasang header di semua rute", async () => {
    const rules = await nextConfig.headers?.()
    expect(rules).toEqual([{ source: "/:path*", headers: SECURITY_HEADERS }])
  })
})
