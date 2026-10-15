"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Globe, LogOut, ChevronRight } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { ModeToggle } from "@/components/molecules/mode-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu"
import { apiFetch } from "@/lib/api/client"
import { sitesQueries } from "@/lib/api/queries/sites"
import { LOGIN_PATH } from "@/lib/auth/routes"
import { notify } from "@/lib/ui/notify"

/** Data pengguna yang dikirim layout `(dashboard)` ke shell (hanya field aman untuk browser). */
export interface ShellUser {
  email: string
}

const ROUTE_LABELS: Record<string, string> = {
  sites: "Daftar Website",
  batches: "Daftar Batch",
  queue: "Antrean",
  items: "Item Antrean",
  posts: "Artikel",
  new: "Tulis Cepat",
  scheduled: "Artikel Terjadwal",
  tools: "WP Tools",
  agents: "Profil Agen",
  skills: "Skill Registry",
  lab: "Laboratorium",
  settings: "Pengaturan",
  keys: "Pusat Kunci API",
  profile: "Profil Pengguna",
  docs: "Dokumentasi",
}

function getBreadcrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  const items = [{ label: "Dashboard", href: "/" }]
  let currentPath = ""

  parts.forEach((part, index) => {
    currentPath += `/${part}`
    const isLast = index === parts.length - 1
    const label =
      ROUTE_LABELS[part] ||
      (part.length > 20 ? "Detail" : part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " "))
    items.push({ label, href: isLast ? "" : currentPath })
  })

  return items
}

export function TopNavbar({ user }: { user: ShellUser }) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [isSigningOut, setIsSigningOut] = React.useState(false)
  const { data: sites } = useQuery(sitesQueries.list())

  const breadcrumbs = React.useMemo(() => getBreadcrumbs(pathname), [pathname])
  const initials = user.email.slice(0, 2).toUpperCase() || "?"

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await apiFetch("/api/auth/signout", { method: "POST" })
    } catch (error) {
      // Cookie sesi lokal tetap dihapus server bila revoke global gagal; tetap arahkan ke login.
      notify.error(error, { fallback: "Gagal mengakhiri sesi di server. Anda tetap dikeluarkan dari perangkat ini." })
    } finally {
      // Cache milik akun ini tidak boleh terbaca akun berikutnya di tab yang sama.
      queryClient.clear()
      router.replace(LOGIN_PATH)
      router.refresh()
    }
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-border/80 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs">
        <ol className="flex min-w-0 items-center gap-1.5">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1
            return (
              <li key={`${crumb.label}-${idx}`} className="flex min-w-0 items-center gap-1.5">
                {idx > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/40" />}
                {isLast ? (
                  <span aria-current="page" className="max-w-52 truncate font-semibold text-foreground sm:max-w-xs">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="max-w-36 truncate rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="flex items-center gap-2.5">
        <ModeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 cursor-pointer rounded-full bg-primary/10 text-xs font-bold text-primary hover:bg-primary/20"
              aria-label={`Menu akun ${user.email}`}
              title={user.email}
            >
              {initials}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 text-xs">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-xs leading-none font-medium text-foreground">Akun</p>
                <p className="truncate font-mono text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/sites" className="flex items-center gap-2">
                  <Globe aria-hidden="true" className="size-3.5" />
                  <span>Kelola Website{sites ? ` (${sites.length})` : ""}</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={handleSignOut}
                disabled={isSigningOut}
                className="flex cursor-pointer items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut aria-hidden="true" className="size-3.5" />
                <span>{isSigningOut ? "Mengeluarkan…" : "Keluar"}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
