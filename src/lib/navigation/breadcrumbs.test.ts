import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DASHBOARD_ROUTE_CRUMBS, getBreadcrumbs, matchDashboardRoute } from "./breadcrumbs"

const DASHBOARD_DIR = path.resolve(import.meta.dirname, "../../app/(dashboard)")
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e"

interface DashboardPage {
  pattern: string
  source: string
}

/** Semua `page.tsx` di route group `(dashboard)` → pola URL (route group dibuang, `[param]` dipertahankan). */
function listDashboardPages(dir = DASHBOARD_DIR): DashboardPage[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listDashboardPages(fullPath)
    if (entry.name !== "page.tsx") return []
    const segments = path
      .relative(DASHBOARD_DIR, path.dirname(fullPath))
      .split(path.sep)
      .filter((segment) => segment && !/^\(.*\)$/.test(segment))
    return [{ pattern: `/${segments.join("/")}`, source: readFileSync(fullPath, "utf8") }]
  })
}

/** Page yang hanya mengalihkan (`redirect()` tanpa `PageContainer`) tidak pernah menampilkan breadcrumb. */
const isRedirectOnly = (source: string) => /\bredirect\(/.test(source) && !source.includes("PageContainer")

const labels = (pathname: string) => getBreadcrumbs(pathname).map((crumb) => crumb.label)

describe("peta breadcrumb vs halaman dasbor", () => {
  const pages = listDashboardPages()
  const renderedPages = pages.filter((page) => !isRedirectOnly(page.source))

  it("setiap page.tsx dasbor (selain pengalih) terdaftar, dan tidak ada entri basi", () => {
    expect(renderedPages.length).toBeGreaterThan(20)
    expect(Object.keys(DASHBOARD_ROUTE_CRUMBS).sort()).toEqual(renderedPages.map((page) => page.pattern).sort())
  })

  it("label crumb = `metadata.title` halaman (judul tab browser)", () => {
    for (const page of renderedPages) {
      const title = /export const metadata = \{ title: "([^"]+)" \}/.exec(page.source)?.[1]
      expect(title, `metadata.title ${page.pattern}`).toBeDefined()
      expect(DASHBOARD_ROUTE_CRUMBS[page.pattern].label, page.pattern).toBe(title)
    }
  })

  it("induk selalu rute statis yang terdaftar", () => {
    for (const [pattern, crumb] of Object.entries(DASHBOARD_ROUTE_CRUMBS)) {
      if (!crumb.parent) continue
      expect(crumb.parent, pattern).not.toContain("[")
      expect(DASHBOARD_ROUTE_CRUMBS[crumb.parent], `${pattern} → ${crumb.parent}`).toBeDefined()
    }
  })
})

describe("getBreadcrumbs", () => {
  it("Dashboard saja di beranda", () => {
    expect(getBreadcrumbs("/")).toEqual([{ label: "Dashboard", href: "" }])
  })

  it("regresi: /agents/new & /skills/new bukan 'Tulis Cepat'", () => {
    expect(getBreadcrumbs("/agents/new")).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "Profil Agen", href: "/agents" },
      { label: "Profil Agen Baru", href: "" },
    ])
    expect(labels("/skills/new")).toEqual(["Dashboard", "Skill Registry", "Tambah Skill"])
  })

  it("regresi: /queue = Tulis Massal, /queue/items = Antrean (bukan anak Tulis Massal)", () => {
    expect(labels("/queue")).toEqual(["Dashboard", "Tulis Massal"])
    expect(getBreadcrumbs("/queue/items")).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "Antrean", href: "" },
    ])
  })

  it("rute penerbitan & WP Tools memakai label Indonesia tanpa segmen pengalih", () => {
    expect(labels("/posts/new")).toEqual(["Dashboard", "Tulis Cepat"])
    expect(labels("/write/structured")).toEqual(["Dashboard", "Tulis Terstruktur"])
    expect(getBreadcrumbs("/tools/link-building")).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "WP Tools", href: "/tools" },
      { label: "Link Building", href: "" },
    ])
    expect(labels("/tools/authors")).toEqual(["Dashboard", "WP Tools", "Author Creator"])
    expect(labels("/tools/categories")).toEqual(["Dashboard", "WP Tools", "Kategori Creator"])
    expect(labels("/settings/webhooks")).toEqual(["Dashboard", "Pengaturan", "Integrasi Webhook"])
  })

  it("segmen dinamis [id] → label generik per jenis halaman; pola statis diutamakan", () => {
    expect(getBreadcrumbs(`/posts/${UUID}`)).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "Antrean", href: "/queue/items" },
      { label: "Detail Artikel", href: "" },
    ])
    expect(labels(`/sites/${UUID}`)).toEqual(["Dashboard", "Daftar Website", "Kelola Website"])
    expect(labels(`/agents/${UUID}`)).toEqual(["Dashboard", "Profil Agen", "Edit Profil Agen"])
    expect(labels(`/skills/${UUID}`)).toEqual(["Dashboard", "Skill Registry", "Detail Skill"])
    expect(matchDashboardRoute("/agents/new")).toBe("/agents/new")
    expect(matchDashboardRoute(`/agents/${UUID}`)).toBe("/agents/[id]")
  })

  it("garis miring akhir & query diabaikan", () => {
    expect(labels("/sites/")).toEqual(["Dashboard", "Daftar Website"])
    expect(labels("/agents/new?cloneFrom=preset%3Aquick-writer")).toEqual(["Dashboard", "Profil Agen", "Profil Agen Baru"])
  })

  it("rute di luar peta → leluhur terdaftar terdekat + crumb 'Detail'", () => {
    expect(getBreadcrumbs(`/sites/${UUID}/lainnya`)).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "Daftar Website", href: "/sites" },
      { label: "Kelola Website", href: `/sites/${UUID}` },
      { label: "Detail", href: "" },
    ])
    expect(getBreadcrumbs("/tidak-ada")).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "Detail", href: "" },
    ])
  })
})
