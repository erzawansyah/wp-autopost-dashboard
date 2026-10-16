import { describe, expect, it } from "vitest"
import type { Site, SiteStatus } from "@/types/site"
import { selectUsableSites } from "./sites"

function site(id: string, status: SiteStatus): Site {
  return {
    id,
    site_name: `Situs ${id}`,
    base_url: `https://${id}.example.test`,
    wp_username: "editor",
    status,
    default_author_id: null,
    default_category_id: null,
    max_concurrency: 2,
    last_checked_at: null,
    created_at: "2026-10-16T00:00:00.000Z",
  }
}

describe("selectUsableSites", () => {
  it("hanya menyembunyikan auth_error; status sementara tetap dapat dipilih", () => {
    const sites = [
      site("a", "connected"),
      site("b", "auth_error"),
      site("c", "rate_limited"),
      site("d", "unreachable"),
    ]
    expect(selectUsableSites(sites).map((s) => s.id)).toEqual(["a", "c", "d"])
  })
})
