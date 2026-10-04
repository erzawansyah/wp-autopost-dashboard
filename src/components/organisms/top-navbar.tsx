"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Globe, LogOut, ChevronRight } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { ModeToggle } from "@/components/molecules/mode-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu"

interface TopNavbarProps {
  selectedSite?: string
  onSelectSite?: (siteId: string) => void
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
  if (parts.length === 0) {
    return [{ label: "Dashboard", href: "/" }]
  }

  const items = [{ label: "Dashboard", href: "/" }]
  let currentPath = ""

  parts.forEach((part, index) => {
    currentPath += `/${part}`
    const isLast = index === parts.length - 1
    const label =
      ROUTE_LABELS[part] ||
      (part.length > 20
        ? "Detail"
        : part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " "))
    items.push({
      label,
      href: isLast ? "" : currentPath,
    })
  })

  return items
}

export function TopNavbar({
  selectedSite = "all",
  onSelectSite,
}: TopNavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [currentUser, setCurrentUser] = React.useState<{ id: string; email: string } | null>(null)
  const [sites, setSites] = React.useState<Array<{ id: string; site_name: string }>>([])

  const breadcrumbs = React.useMemo(() => getBreadcrumbs(pathname), [pathname])

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser(data.user)
        }
      })
      .catch(() => {})

    fetch("/api/sites")
      .then((res) => res.json())
      .then((data) => {
        if (data.sites) {
          setSites(data.sites)
        }
      })
      .catch(() => {})
  }, [])

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" })
      router.push("/login")
      router.refresh()
    } catch {
      router.push("/login")
    }
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-[64px] items-center justify-between gap-4 border-b border-border/80 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      {/* Left: Dynamic Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1
          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
              )}
              {isLast ? (
                <span className="font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[140px]"
                >
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          )
        })}
      </nav>

      {/* Right: Mode Toggle & User Controls */}
      <div className="flex items-center gap-2.5">
        <ModeToggle />

        {/* User Auth Dropdown */}
        {currentUser ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20 cursor-pointer"
                title={currentUser.email}
              >
                {currentUser.email.slice(0, 2).toUpperCase()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 text-xs">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-xs font-medium leading-none text-foreground">Akun</p>
                  <p className="text-[11px] leading-none text-muted-foreground truncate font-mono">
                    {currentUser.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/sites" className="flex items-center gap-2">
                  <Globe className="size-3.5" />
                  <span>Kelola Website ({sites.length})</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10 flex items-center gap-2"
              >
                <LogOut className="size-3.5" />
                <span>Keluar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              asChild
              className="text-xs cursor-pointer"
            >
              <Link href="/login">Masuk</Link>
            </Button>
            <Button
              size="xs"
              asChild
              className="text-xs cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Link href="/login?tab=register">Daftar</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
