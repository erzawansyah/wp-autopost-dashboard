"use client"

import * as React from "react"
import { SidebarNav } from "@/components/organisms/sidebar-nav"
import { TopNavbar } from "@/components/organisms/top-navbar"

interface DashboardLayoutProps {
  children: React.ReactNode
  selectedSite?: string
  onSelectSite?: (siteId: string) => void
  onQuickPostSuccess?: () => void
}

export function DashboardLayout({
  children,
  selectedSite = "all",
  onSelectSite,
}: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Static Sidebar Navigation */}
      <SidebarNav />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar
          selectedSite={selectedSite}
          onSelectSite={onSelectSite}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto flex flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
