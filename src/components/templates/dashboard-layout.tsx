"use client"

import * as React from "react"
import { SidebarNav } from "@/components/organisms/sidebar-nav"
import { TopNavbar } from "@/components/organisms/top-navbar"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="relative flex min-h-screen bg-background text-foreground">
      <div aria-hidden="true" className="dashboard-grid pointer-events-none absolute inset-x-0 top-0 h-96 opacity-40" />
      {/* Static Sidebar Navigation */}
      <SidebarNav />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar />

        <main className="relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
