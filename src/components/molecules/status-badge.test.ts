import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { badgeVariants } from "@/components/atoms/badge"
import { SiteStatusBadge } from "@/components/molecules/site-status-badge"
import { StatusBadge } from "@/components/molecules/status-badge"
import { cn } from "@/lib/utils"
import { POST_ITEM_STATES } from "@/lib/validation/queue"
import type { PostItemState } from "@/types/queue"
import type { SiteStatus } from "@/types/site"

const variantOf = (html: string) => /data-slot="badge" data-variant="([^"]+)"/.exec(html)?.[1]
/** Kelas pada elemen Badge (bukan pembungkus), entitas HTML dikembalikan. */
const badgeClassOf = (html: string) =>
  (/data-slot="badge" data-variant="[^"]+" class="([^"]+)"/.exec(html)?.[1] ?? "").replaceAll("&amp;", "&").replaceAll("&gt;", ">")

/** DESIGN.md §8C: state → label & varian peran atom Badge. */
type BadgeVariant = NonNullable<Parameters<typeof badgeVariants>[0]>["variant"]

const EXPECTED: Record<PostItemState, { label: string; variant: BadgeVariant }> = {
  queued_input: { label: "Menunggu", variant: "muted" },
  generating_content: { label: "Sedang Ditulis", variant: "ai" },
  ready_to_sync: { label: "Siap Kirim", variant: "info" },
  syncing_to_wp: { label: "Mengirim ke Web", variant: "info" },
  published_on_wp: { label: "Sudah Terbit", variant: "success" },
  scheduled_on_wp: { label: "Dijadwalkan", variant: "warning" },
  saved_draft_on_wp: { label: "Tersimpan Draf", variant: "secondary" },
  failed_generation: { label: "Gagal Tulis", variant: "destructive" },
  failed_sync: { label: "Gagal Kirim", variant: "destructive" },
}

describe("StatusBadge (DESIGN.md §4C/§8C)", () => {
  it("setiap state memakai varian peran Badge, bukan outline + kelas warna manual", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...POST_ITEM_STATES].sort())
    for (const state of POST_ITEM_STATES) {
      const html = renderToStaticMarkup(createElement(StatusBadge, { status: state }))
      expect(variantOf(html), state).toBe(EXPECTED[state].variant)
      expect(html).toContain(EXPECTED[state].label)
      // Warna hanya dari varian atom; molekul menambah kelas tata letak saja.
      expect(badgeClassOf(html)).toBe(cn(badgeVariants({ variant: EXPECTED[state].variant }), "h-5 gap-1.5"))
    }
  })

  it("ikon berputar hanya untuk proses berjalan, selalu dengan motion-reduce", () => {
    const writing = renderToStaticMarkup(createElement(StatusBadge, { status: "generating_content" }))
    expect(writing).toContain("animate-spin motion-reduce:animate-none")
    expect(renderToStaticMarkup(createElement(StatusBadge, { status: "published_on_wp" }))).not.toContain("animate-spin")
    expect(renderToStaticMarkup(createElement(StatusBadge, { status: "failed_sync", showIcon: false }))).not.toContain("<svg")
  })
})

describe("SiteStatusBadge", () => {
  const cases: Array<[SiteStatus, string, string]> = [
    ["connected", "success", "Tersambung"],
    ["auth_error", "destructive", "Kredensial ditolak"],
    ["rate_limited", "warning", "Dibatasi WordPress"],
    ["unreachable", "muted", "Tidak terjangkau"],
  ]

  it.each(cases)("%s → varian %s", (status, variant, label) => {
    const html = renderToStaticMarkup(createElement(SiteStatusBadge, { status }))
    expect(variantOf(html)).toBe(variant)
    expect(html).toContain(label)
  })
})
