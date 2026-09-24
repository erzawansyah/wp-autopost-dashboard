"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Layers,
  Globe,
  SlidersHorizontal,
  Bot,
  Settings,
  Sparkles,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/atoms/badge"

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  isExternal?: boolean
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Antrean & Batch",
    href: "/queue",
    icon: Layers,
    badge: "12",
  },
  {
    title: "WordPress Sites",
    href: "/sites",
    icon: Globe,
    badge: "4",
  },
  {
    title: "Prompt Templates",
    href: "/prompts",
    icon: SlidersHorizontal,
  },
  {
    title: "AI Providers (BYOK)",
    href: "/settings/ai",
    icon: Bot,
  },
  {
    title: "Pengaturan Sistem",
    href: "/settings",
    icon: Settings,
  },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r border-border/80 bg-sidebar flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="size-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
          <Sparkles className="size-5 text-accent animate-pulse" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-sidebar-foreground tracking-tight truncate">
            WP Autopost
          </span>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            Multi-Site Publisher
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Navigasi Utama
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                <span className="truncate">{item.title}</span>
              </div>
              {item.badge && (
                <Badge
                  variant={isActive ? "secondary" : "outline"}
                  className={cn(
                    "text-[10px] h-4 px-1.5 font-mono",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground border-transparent"
                      : "text-muted-foreground border-border/80"
                  )}
                >
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}
      </div>

      {/* Bottom Health & System State */}
      <div className="p-4 border-t border-sidebar-border flex flex-col gap-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
            <span className="text-[11px] font-medium text-foreground/80">
              Worker Engine Active
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">v0.1.0</span>
        </div>
        <div className="p-2.5 rounded-lg border border-border/70 bg-card text-[11px] flex flex-col gap-1">
          <span className="font-semibold text-foreground">Anti-AI Writing Guard</span>
          <span className="text-muted-foreground text-[10px] leading-tight">
            Filter pola klise aktif di seluruh modul
          </span>
        </div>
      </div>
    </aside>
  )
}
