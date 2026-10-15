import { describe, expect, it } from "vitest"
import { CONNECT_STATUSES, describeConnectStatus } from "./connect-status"

describe("describeConnectStatus", () => {
  it("tanpa auth_status → null", () => {
    expect(describeConnectStatus({})).toBeNull()
    expect(describeConnectStatus({ authStatus: "  " })).toBeNull()
  })

  it("setiap status dari callback punya banner sendiri (termasuk missing_state)", () => {
    for (const status of CONNECT_STATUSES) {
      const notice = describeConnectStatus({ authStatus: status })
      expect(notice?.status).toBe(status)
      expect(notice?.title).toBeTruthy()
      expect(notice?.description).toBeTruthy()
    }
    expect(describeConnectStatus({ authStatus: "missing_state" })).toMatchObject({ variant: "destructive" })
  })

  it("connected memakai nama situs; tanpa nama → WordPress", () => {
    expect(describeConnectStatus({ authStatus: "connected", siteName: "Blog Kopi" })).toMatchObject({
      variant: "success",
      description: expect.stringContaining('"Blog Kopi"'),
    })
    expect(describeConnectStatus({ authStatus: "connected" })?.description).toContain('"WordPress"')
  })

  it("validation_failed menampilkan pesan WordPress yang dipotong", () => {
    const notice = describeConnectStatus({ authStatus: "validation_failed", error: "Kredensial ditolak (401)." })
    expect(notice?.description).toContain("Kredensial ditolak (401).")

    const long = describeConnectStatus({ authStatus: "validation_failed", error: "x".repeat(1000) })
    expect(long?.description.length).toBeLessThan(400)
  })

  it("rejected = peringatan; status tak dikenal tetap memberi banner umum", () => {
    expect(describeConnectStatus({ authStatus: "rejected" })?.variant).toBe("warning")
    expect(describeConnectStatus({ authStatus: "entah" })).toMatchObject({ status: "unknown", variant: "warning" })
  })
})
