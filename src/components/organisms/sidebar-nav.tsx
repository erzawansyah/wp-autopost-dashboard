"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  PenLine,
  Layers,
  Globe,
  SlidersHorizontal,
  Settings,
  WandSparkles,
  ChevronRight,
  FlaskConical,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/atoms/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip"

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
]

const contentNavItems: NavItem[] = [
  { title: "Tulis Cepat", href: "/posts/new", icon: PenLine },
  { title: "Bulk Artikel", href: "/queue", icon: Layers, badge: "Batch" },
]

const bottomNavItems: NavItem[] = [
  { title: "Format Prompt", href: "/prompts", icon: SlidersHorizontal },
  { title: "Laboratorium", href: "/lab", icon: FlaskConical, badge: "Lab" },
  { title: "Pengaturan", href: "/settings", icon: Settings },
]

function renderNavLink(item: NavItem, pathname: string) {
  const isActive = pathname === item.href
  const Icon = item.icon

  const link = (
    <Link
      href={item.href}
      aria-label={item.title}
      className={cn(
        "group flex items-center justify-center rounded-md px-3 py-2.5 text-[12px] font-medium transition-all lg:justify-between",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        item.isComingSoon && !isActive && "opacity-60 hover:opacity-100"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon
          className={cn(
            "size-4 shrink-0 transition-colors",
            isActive
              ? "text-sidebar-primary-foreground"
              : "text-muted-foreground group-hover:text-sidebar-foreground"
          )}
        />
        <span className="hidden truncate lg:block">{item.title}</span>
      </div>
      {item.badge && (
        <Badge
          variant={isActive ? "secondary" : "outline"}
          className={cn(
            "text-[10px] h-4 px-1.5 font-normal tracking-wide",
            isActive
              ? "bg-primary-foreground/20 text-primary-foreground border-transparent"
              : "text-muted-foreground border-border/70 bg-muted/40"
          )}
        >
          {item.badge}
        </Badge>
      )}
      {isActive && !item.badge && <ChevronRight className="size-3.5 opacity-70" />}
    </Link>
  )

  return (
    <React.Fragment key={item.href}>
      <div className="lg:hidden">
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" align="center">{item.title}</TooltipContent>
        </Tooltip>
      </div>
      <div className="hidden lg:block">{link}</div>
    </React.Fragment>
  )
}

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 flex h-screen max-h-screen w-[68px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:w-[248px]">
      {/* Brand Header */}
      <div className="border-b border-sidebar-border px-3 py-5 lg:px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <WandSparkles className="size-4 text-accent" />
          </div>
          <div className="hidden min-w-0 flex-col lg:flex">
            <span className="truncate text-[13px] font-bold tracking-tight text-sidebar-foreground">WP Autopost</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Publishing desk</span>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex flex-1 flex-col justify-between overflow-y-auto px-2 py-4 lg:px-3">
        {/* Top & Middle Menus */}
        <div className="flex flex-col gap-1">
          <div className="hidden px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
            Menu Utama
          </div>
          {primaryNavItems.map((item) => renderNavLink(item, pathname))}

          {/* Separator */}
          <div className="my-2 border-t border-sidebar-border/70" />

          <div className="hidden px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
            Penerbitan Konten
          </div>
          {contentNavItems.map((item) => renderNavLink(item, pathname))}
        </div>

        {/* Bottom Menus */}
        <div className="flex flex-col gap-1 border-t border-sidebar-border/70 pt-3">
          <div className="hidden px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:block">
            Alat &amp; Konfigurasi
          </div>
          {bottomNavItems.map((item) => renderNavLink(item, pathname))}
        </div>
      </div>

      {/* Bottom Status Card */}
      <div className="flex flex-col gap-3 border-t border-sidebar-border bg-muted/20 p-2 lg:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
            <span className="hidden text-[11px] font-medium text-foreground/80 lg:block">Semua sistem normal</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-500 font-semibold">v0.1.1 (Auto-Deploy)</span>
        </div>
        <div className="p-2.5 rounded-lg border border-border/70 bg-card text-[11px] flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-semibold text-foreground"><WandSparkles className="size-3 text-ai-process" /><span className="hidden lg:inline">Natural writing</span></span>
          <span className="hidden text-muted-foreground text-[10px] leading-tight lg:block">
            Artikel bersih dari pola klise dan format kaku buatan AI
          </span>
        </div>
      </div>
    </aside>
  )
}
