import * as React from "react"
import { SidebarNav } from "@/components/organisms/sidebar-nav"
import { TopNavbar, type ShellUser } from "@/components/organisms/top-navbar"

interface DashboardShellProps {
  /** Ringkasan pengguna sesi dari `(dashboard)/layout.tsx` (hanya field yang aman dikirim ke browser). */
  user: ShellUser
  children: React.ReactNode
}

/**
 * Kerangka dasbor persisten (sidebar + top navbar + kanvas konten).
 *
 * Dirender SEKALI oleh `src/app/(dashboard)/layout.tsx`, sehingga sidebar & navbar tidak di-mount ulang
 * saat berpindah halaman. Halaman cukup merender `PageContainer` + `PageHeader` (lihat
 * `.claude/rules/page-layout-standard.md`). Server Component: hanya `SidebarNav`/`TopNavbar` yang client.
 */
export function DashboardShell({ user, children }: DashboardShellProps) {
  return (
    <div className="relative flex min-h-screen bg-background text-foreground">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Lewati ke konten utama
      </a>
      <div aria-hidden="true" className="dashboard-grid pointer-events-none absolute inset-x-0 top-0 h-96 opacity-40" />
      <SidebarNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopNavbar user={user} />

        <main id="konten-utama" tabIndex={-1} className="relative flex-1 overflow-y-auto px-4 py-5 outline-none sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-360 flex-col gap-7">{children}</div>
        </main>
      </div>
    </div>
  )
}
