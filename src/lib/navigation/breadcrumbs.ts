/**
 * Breadcrumb `TopNavbar`: label Indonesia per rute `src/app/(dashboard)/**` (selaras `metadata.title`/`PageHeader`
 * halaman dan label sidebar) beserta induk logisnya. Hierarki diambil dari peta ini, bukan dari potongan URL:
 * `/queue/items` (Antrean) bukan anak `/queue` (Tulis Massal), dan `/posts`/`/write` hanya rute pengalih.
 * Test `breadcrumbs.test.ts` memastikan setiap `page.tsx` dasbor (selain pengalih) terdaftar di sini.
 */

export interface Breadcrumb {
  label: string
  /** Kosong untuk crumb terakhir (halaman aktif, tanpa tautan). */
  href: string
}

interface RouteCrumb {
  label: string
  /** Pola rute induk (statis, kunci lain di peta ini); tanpa induk = langsung di bawah Dashboard. */
  parent?: string
}

/** Pola rute (segmen dinamis ditulis `[id]`) → label & induk. */
export const DASHBOARD_ROUTE_CRUMBS: Readonly<Record<string, RouteCrumb>> = {
  "/": { label: "Dashboard" },
  "/sites": { label: "Daftar Website" },
  "/sites/[id]": { label: "Kelola Website", parent: "/sites" },
  "/batches": { label: "Daftar Batch" },
  "/queue/items": { label: "Antrean" },
  "/posts/[id]": { label: "Detail Artikel", parent: "/queue/items" },
  "/posts/new": { label: "Tulis Cepat" },
  "/queue": { label: "Tulis Massal" },
  "/write/niche": { label: "Tulis Niche" },
  "/write/structured": { label: "Tulis Terstruktur" },
  "/tools": { label: "WP Tools" },
  "/tools/link-building": { label: "Link Building", parent: "/tools" },
  "/tools/authors": { label: "Author Creator", parent: "/tools" },
  "/tools/categories": { label: "Kategori Creator", parent: "/tools" },
  "/agents": { label: "Profil Agen" },
  "/agents/new": { label: "Profil Agen Baru", parent: "/agents" },
  "/agents/[id]": { label: "Edit Profil Agen", parent: "/agents" },
  "/skills": { label: "Skill Registry" },
  "/skills/new": { label: "Tambah Skill", parent: "/skills" },
  "/skills/[id]": { label: "Detail Skill", parent: "/skills" },
  "/lab": { label: "Laboratorium" },
  "/settings": { label: "Pengaturan" },
  "/settings/keys": { label: "Kunci API & Model AI", parent: "/settings" },
  "/settings/profile": { label: "Profil & Preferensi Akun", parent: "/settings" },
  "/settings/webhooks": { label: "Integrasi Webhook", parent: "/settings" },
  "/docs": { label: "Dokumentasi & Panduan" },
}

/** Label crumb terakhir untuk rute di luar peta (mis. halaman baru yang belum didaftarkan). */
const FALLBACK_LABEL = "Detail"

function splitPath(pathname: string): string[] {
  return pathname.split(/[?#]/, 1)[0].split("/").filter(Boolean)
}

const isDynamicSegment = (segment: string) => segment.startsWith("[") && segment.endsWith("]")

/** Pola terdaftar untuk `pathname`; pola statis diutamakan atas pola dinamis (`/agents/new` vs `/agents/[id]`). */
export function matchDashboardRoute(pathname: string): string | null {
  const segments = splitPath(pathname)
  let best: { pattern: string; staticCount: number } | null = null
  for (const pattern of Object.keys(DASHBOARD_ROUTE_CRUMBS)) {
    const patternSegments = splitPath(pattern)
    if (patternSegments.length !== segments.length) continue
    let staticCount = 0
    const matches = patternSegments.every((part, index) => {
      if (isDynamicSegment(part)) return segments[index].length > 0
      staticCount += 1
      return part === segments[index]
    })
    if (matches && (!best || staticCount > best.staticCount)) best = { pattern, staticCount }
  }
  return best?.pattern ?? null
}

/** Rantai pola dari Dashboard sampai `pattern` (induk lebih dulu). */
function trailFor(pattern: string): string[] {
  const trail: string[] = []
  let current: string | undefined = pattern
  while (current && current !== "/" && !trail.includes(current)) {
    trail.unshift(current)
    current = DASHBOARD_ROUTE_CRUMBS[current]?.parent
  }
  return ["/", ...trail]
}

/**
 * Breadcrumb untuk `pathname`: Dashboard → induk → halaman aktif (href kosong). Rute di luar peta memakai
 * leluhur terdekat yang terdaftar + crumb generik "Detail".
 */
export function getBreadcrumbs(pathname: string): Breadcrumb[] {
  const matched = matchDashboardRoute(pathname)
  if (matched) {
    const trail = trailFor(matched)
    return trail.map((pattern, index) => ({
      label: DASHBOARD_ROUTE_CRUMBS[pattern].label,
      href: index === trail.length - 1 ? "" : pattern,
    }))
  }

  // Di luar peta: leluhur terdekat yang terdaftar (paling tidak Dashboard) + crumb generik.
  const segments = splitPath(pathname)
  const pathOf = (length: number) => `/${segments.slice(0, length).join("/")}`
  let length = segments.length - 1
  while (length > 0 && !matchDashboardRoute(pathOf(length))) length--
  const ancestorPath = pathOf(length)
  const ancestorCrumbs = getBreadcrumbs(ancestorPath).map((crumb) => ({
    label: crumb.label,
    href: crumb.href || ancestorPath,
  }))
  return [...ancestorCrumbs, { label: FALLBACK_LABEL, href: "" }]
}
