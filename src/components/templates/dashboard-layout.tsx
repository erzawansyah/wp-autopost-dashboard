"use client"

import * as React from "react"
import { SidebarNav } from "@/components/organisms/sidebar-nav"
import { TopNavbar } from "@/components/organisms/top-navbar"
import { QuickSingleModal } from "@/components/organisms/quick-single-modal"
import { BulkBatchModal } from "@/components/organisms/bulk-batch-modal"

interface DashboardLayoutProps {
  children: React.ReactNode
  selectedSite?: string
  onSelectSite?: (siteId: string) => void
  onQuickPostSubmit?: (data: any) => void
  onBulkBatchSubmit?: (data: any) => void
}

export function DashboardLayout({
  children,
  selectedSite = "all",
  onSelectSite,
  onQuickPostSubmit,
  onBulkBatchSubmit,
}: DashboardLayoutProps) {
  const [quickPostOpen, setQuickPostOpen] = React.useState(false)
  const [bulkBatchOpen, setBulkBatchOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Static Sidebar Navigation (Organism) */}
      <SidebarNav />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar
          selectedSite={selectedSite}
          onSelectSite={onSelectSite}
          onOpenQuickPost={() => setQuickPostOpen(true)}
          onOpenBulkBatch={() => setBulkBatchOpen(true)}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto flex flex-col gap-6">
            {children}
          </div>
        </main>
      </div>

      {/* Modals for Direct Workflows */}
      <QuickSingleModal
        open={quickPostOpen}
        onOpenChange={setQuickPostOpen}
        onSubmit={onQuickPostSubmit}
      />

      <BulkBatchModal
        open={bulkBatchOpen}
        onOpenChange={setBulkBatchOpen}
        onSubmit={onBulkBatchSubmit}
      />
    </div>
  )
}
