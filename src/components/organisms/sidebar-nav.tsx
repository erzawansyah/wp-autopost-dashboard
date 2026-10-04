"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  PenLine,
  Layers,
  Globe,
  History,
  ListChecks,
  Bot,
  Settings,
  WandSparkles,
  ChevronRight,
  FlaskConical,
  CalendarClock,
  Wrench,
  FileCode2,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/atoms/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip"
import { isLabAuthorizedUser } from "@/lib/constants/auth"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  isComingSoon?: boolean
}

const primaryNavItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Daftar Website", href: "/sites", icon: Globe },
  { title: "Daftar Batch", href: "/batches", icon: History },
  { title: "Antrean", href: "/queue/items", icon: ListChecks },
]

const contentNavItems: NavItem[] = [
  { title: "Tulis Cepat", href: "/posts/new", icon: PenLine },
  { title: "Bulk Artikel", href: "/queue", icon: Layers, badge: "Batch" },
  { title: "Artikel Terjadwal", href: "/scheduled", icon: CalendarClock, badge: "Drip" },
]

const toolsNavItems: NavItem[] = [
  { title: "WP Tools", href: "/tools", icon: Wrench },
]

const bottomNavItems: NavItem[] = [
  { title: "Profil Agen", href: "/agents", icon: Bot },
  { title: "Skill Registry", href: "/skills", icon: FileCode2, badge: "Deep" },
  { title: "Laboratorium", href: "/lab", icon: FlaskConical, badge: "Lab" },
  { title: "Pengaturan", href: "/settings", icon: Settings },
  { title: "Help / Docs", href: "/docs", icon: BookOpen },
]

const ALL_NAV_HREFS = [
  "/",
  "/sites",
  "/batches",
  "/queue/items",
  "/posts/new",
  "/queue",
  "/scheduled",
  "/tools",
  "/agents",
  "/skills",
  "/lab",
  "/settings",
  "/docs",
]

function checkIsNavActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/") {
    return pathname === "/"
  }
  if (pathname === itemHref) {
    return true
  }
  if (!pathname.startsWith(itemHref + "/")) {
    return false
  }
  // Cegah active conflict jika ada rute turunan yang lebih spesifik (misal /queue vs /queue/items)
  const hasMoreSpecific = ALL_NAV_HREFS.some(
    (otherHref) =>
      otherHref !== itemHref &&
      otherHref.startsWith(itemHref + "/") &&
      (pathname === otherHref || pathname.startsWith(otherHref + "/"))
  )
  return !hasMoreSpecific
}

function renderNavLink(item: NavItem, pathname: string, isCollapsed: boolean) {
  const isActive = checkIsNavActive(item.href, pathname)
  const Icon = item.icon

  const link = (
    <Link
      href={item.href}
      aria-label={item.title}
      className={cn(
        "group flex items-center rounded-md text-[12px] font-medium transition-all",
        isCollapsed
          ? "justify-center p-2.5"
          : "justify-center px-3 py-2.5 lg:justify-between",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        item.isComingSoon && !isActive && "opacity-60 hover:opacity-100"
      )}
    >
      <div className={cn("flex items-center gap-2.5 min-w-0", isCollapsed && "justify-center")}>
        <Icon
          className={cn(
            "size-4 shrink-0 transition-colors",
            isActive
              ? "text-sidebar-primary-foreground"
              : "text-muted-foreground group-hover:text-sidebar-foreground"
          )}
        />
        {!isCollapsed && <span className="hidden truncate lg:block">{item.title}</span>}
      </div>
      {!isCollapsed && item.badge && (
        <Badge
          variant={isActive ? "secondary" : "outline"}
          className={cn(
            "hidden lg:inline-flex text-[10px] h-4 px-1.5 font-normal tracking-wide",
            isActive
              ? "bg-primary-foreground/20 text-primary-foreground border-transparent"
              : "text-muted-foreground border-border/70 bg-muted/40"
          )}
        >
          {item.badge}
        </Badge>
      )}
      {!isCollapsed && isActive && !item.badge && (
        <ChevronRight className="hidden lg:block size-3.5 opacity-70" />
      )}
    </Link>
  )

  // Jika sidebar dalam keadaan collapsed, wajib dibungkus Tooltip untuk interaksi hover
  if (isCollapsed) {
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" align="center" className="flex items-center gap-2 z-50">
          <span>{item.title}</span>
          {item.badge && (
            <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0">
              {item.badge}
            </Badge>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Jika tidak collapsed: mobile tetap pakai tooltip, desktop langsung tampilkan label
  return (
    <React.Fragment key={item.href}>
      <div className="lg:hidden">
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" align="center" className="flex items-center gap-2 z-50">
            <span>{item.title}</span>
            {item.badge && (
              <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0">
                {item.badge}
              </Badge>
            )}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="hidden lg:block">{link}</div>
    </React.Fragment>
  )
}

let cachedSidebarCollapsed: boolean | null = null

export function SidebarNav() {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = React.useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    if (cachedSidebarCollapsed !== null) {
      return cachedSidebarCollapsed
    }
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("wp_sidebar_collapsed")
        if (saved !== null) {
          cachedSidebarCollapsed = saved === "true"
          return cachedSidebarCollapsed
        }
      } catch {
        // LocalStorage tidak tersedia
      }
    }
    return false
  })

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      cachedSidebarCollapsed = next
      try {
        localStorage.setItem("wp_sidebar_collapsed", String(next))
      } catch {
        // Abaikan galat penyimpanan lokal
      }
      return next
    })
  }

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.email) {
          setUserEmail(data.user.email)
        }
      })
      .catch(() => {})
  }, [])

  const filteredBottomNavItems = React.useMemo(() => {
    return bottomNavItems.filter((item) => {
      if (item.href === "/lab") {
        return isLabAuthorizedUser(userEmail)
      }
      return true
    })
  }, [userEmail])

  return (
    <aside
      suppressHydrationWarning
      className={cn(
        "sticky top-0 flex h-screen max-h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out z-30",
        isCollapsed ? "w-[68px]" : "w-[68px] lg:w-[256px]"
      )}
    >
      {/* Brand Header */}
      <div className="border-b border-sidebar-border px-3 py-3 lg:px-3.5">
        {isCollapsed ? (
          /* Tampilan Rapi Saat Collapsed: Logo Favicon Terpusat Sekaligus Tombol Expand */
          <div className="flex items-center justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="group relative flex size-9 items-center justify-center rounded-lg border border-border/70 bg-card hover:bg-sidebar-accent transition-all cursor-pointer overflow-hidden p-1 shadow-2xs"
                  aria-label="Perluas Sidebar"
                >
                  <img
                    src="/assets/panitera-favicon.png"
                    alt="Panitera"
                    className="size-7 object-contain transition-transform group-hover:scale-110"
                  />
                  {/* Overlay icon hover untuk mempertegas fungsi expand */}
                  <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-primary">
                    <PanelLeftOpen className="size-4" />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Perluas Sidebar
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          /* Tampilan Saat Expanded: Logo Full Lebih Besar di Kiri (Klik ke Dashboard), Toggle Ciutkan di Kanan */
          <div className="flex items-center justify-between gap-1.5">
            {/* Desktop: Logo Full (Light / Dark) yang Memenuhi Sidebar */}
            <Link
              href="/"
              className="hidden lg:flex items-center flex-1 min-w-0 py-0.5 hover:opacity-85 transition-opacity"
              title="Kembali ke Dashboard Panitera"
            >
              <img
                src="/assets/panitera-logo.png"
                alt="Panitera - Publishing Desk"
                className="h-10 w-full max-w-[195px] object-contain object-left dark:hidden"
              />
              <img
                src="/assets/panitera-logo-inverse.png"
                alt="Panitera - Publishing Desk"
                className="h-10 w-full max-w-[195px] object-contain object-left hidden dark:block"
              />
            </Link>
            {/* Mobile: Favicon Logo */}
            <Link
              href="/"
              className="flex lg:hidden items-center justify-center mx-auto hover:opacity-80 transition-opacity"
              title="Kembali ke Dashboard Panitera"
            >
              <img
                src="/assets/panitera-favicon.png"
                alt="Panitera Logo"
                className="size-7 object-contain"
              />
            </Link>

            {/* Tombol Toggle Ciutkan (Desktop) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="hidden lg:flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer shrink-0"
                  aria-label="Ciutkan Sidebar"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Ciutkan Sidebar
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <div className="flex flex-1 flex-col justify-between overflow-y-auto px-2 py-4 lg:px-3">
        {/* Top & Middle Menus */}
        <div className="flex flex-col gap-1">
          {!isCollapsed && (
            <div className="hidden px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
              Menu Utama
            </div>
          )}
          {primaryNavItems.map((item) => renderNavLink(item, pathname, isCollapsed))}

          {/* Separator */}
          <div className="my-2 border-t border-sidebar-border/70" />

          {!isCollapsed && (
            <div className="hidden px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
              Penerbitan Konten
            </div>
          )}
          {contentNavItems.map((item) => renderNavLink(item, pathname, isCollapsed))}

          {/* Separator */}
          <div className="my-2 border-t border-sidebar-border/70" />

          {!isCollapsed && (
            <div className="hidden px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
              Tools
            </div>
          )}
          {toolsNavItems.map((item) => renderNavLink(item, pathname, isCollapsed))}
        </div>

        {/* Bottom Menus */}
        <div className="flex flex-col gap-1 border-t border-sidebar-border/70 pt-3">
          {!isCollapsed && (
            <div className="hidden px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
              Alat &amp; Konfigurasi
            </div>
          )}
          {filteredBottomNavItems.map((item) => renderNavLink(item, pathname, isCollapsed))}
        </div>
      </div>

      {/* Bottom Status Card */}
      <div className="flex flex-col gap-2.5 border-t border-sidebar-border bg-muted/20 p-2 lg:p-3">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex size-7 items-center justify-center cursor-default">
                  <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Semua sistem normal (v0.1.2)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/docs"
                  className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-card hover:bg-sidebar-accent text-primary transition-colors cursor-pointer"
                >
                  <BookOpen className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Help &amp; Docs</TooltipContent>
            </Tooltip>

            {/* Tombol Expand Cepat di Bawah */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="hidden lg:flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
                  aria-label="Perluas Sidebar"
                >
                  <PanelLeftOpen className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Perluas Sidebar</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                <span className="hidden text-[11px] font-medium text-foreground/80 lg:block">
                  Semua sistem normal
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">v0.1.2</span>
            </div>
            <Link
              href="/docs"
              className="group flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-card hover:bg-sidebar-accent text-[11px] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="size-3.5 text-primary shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-foreground text-xs group-hover:text-primary transition-colors truncate">
                    Help &amp; Docs
                  </span>
                  <span className="hidden text-muted-foreground text-[10px] leading-tight lg:block truncate">
                    Panduan &amp; Dokumentasi
                  </span>
                </div>
              </div>
              <ChevronRight className="size-3 text-muted-foreground group-hover:text-foreground hidden lg:block shrink-0" />
            </Link>
          </>
        )}
      </div>
    </aside>
  )
}
