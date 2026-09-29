"use client"

import * as React from "react"
import { Layers, Plus, RefreshCw, ListChecks, CalendarClock, History } from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import { Button } from "@/components/atoms/button"
import {
  KeywordListForm,
  WpSiteOption,
} from "@/components/organisms/batch-keyword/keyword-list-form"
import {
  BatchListTable,
  BatchItemData,
} from "@/components/organisms/batch-keyword/batch-list-table"
import {
  QueueDataTable,
  QueueTableItem,
} from "@/components/organisms/queue-data-table"

export default function QueuePage() {
  const [activeTab, setActiveTab] = React.useState<string>("create")
  const [sites, setSites] = React.useState<WpSiteOption[]>([])
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)

  const [batches, setBatches] = React.useState<BatchItemData[]>([])
  const [isLoadingBatches, setIsLoadingBatches] = React.useState(true)

  const [queueItems, setQueueItems] = React.useState<QueueTableItem[]>([])
  const [isLoadingQueue, setIsLoadingQueue] = React.useState(true)
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [processResult, setProcessResult] = React.useState<string | null>(null)

  // 1. Fetch connected sites
  const fetchSites = React.useCallback(async () => {
    setIsLoadingSites(true)
    try {
      const res = await fetch("/api/sites")
      const data = await res.json()
      if (res.ok && Array.isArray(data.sites)) {
        setSites(
          data.sites
            .filter((s: { status?: string }) => s.status === "connected")
            .map((s: { id: string; site_name: string; base_url: string; status?: string }) => ({
              id: s.id,
              site_name: s.site_name,
              base_url: s.base_url,
              status: s.status,
            }))
        )
      }
    } catch (err) {
      console.error("[QueuePage] Error fetching sites:", err)
    } finally {
      setIsLoadingSites(false)
    }
  }, [])

  // 2. Fetch batches
  const fetchBatches = React.useCallback(async () => {
    setIsLoadingBatches(true)
    try {
      const res = await fetch("/api/batches")
      const data = await res.json()
      if (res.ok && Array.isArray(data.batches)) {
        setBatches(data.batches)
      }
    } catch (err) {
      console.error("[QueuePage] Error fetching batches:", err)
    } finally {
      setIsLoadingBatches(false)
    }
  }, [])

  // 3. Fetch queue items
  const fetchQueue = React.useCallback(async () => {
    setIsLoadingQueue(true)
    try {
      const res = await fetch("/api/queue")
      const data = await res.json()
      if (res.ok && Array.isArray(data.items)) {
        const formatted: QueueTableItem[] = data.items.map(
          (item: {
            id: string
            title: string | null
            target_keyword: string
            wp_sites: { site_name: string; base_url: string } | null
            categories: string[] | null
            state: QueueTableItem["status"]
            scheduled_for: string | null
            wp_post_url: string | null
            last_error: string | null
          }) => ({
            id: item.id,
            title: item.title || item.target_keyword,
            targetKeyword: item.target_keyword,
            siteName: item.wp_sites?.site_name || "WordPress",
            siteDomain: item.wp_sites?.base_url
              ? item.wp_sites.base_url.replace(/^https?:\/\//, "")
              : "-",
            category:
              item.categories && item.categories.length > 0
                ? item.categories[0]
                : "Tak Berkategori",
            status: item.state,
            scheduledFor: item.scheduled_for || undefined,
            wpPostUrl: item.wp_post_url || undefined,
            lastError: item.last_error || undefined,
          })
        )
        setQueueItems(formatted)
      }
    } catch (err) {
      console.error("[QueuePage] Error fetching queue items:", err)
    } finally {
      setIsLoadingQueue(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSites()
    fetchBatches()
    fetchQueue()
  }, [fetchSites, fetchBatches, fetchQueue])

  // Saat batch baru berhasil disubmit dari form
  const handleBatchCreated = () => {
    fetchBatches()
    fetchQueue()
    // Alihkan pandangan ke tab daftar batch setelah 800ms
    setTimeout(() => {
      setActiveTab("batches")
    }, 800)
  }

  // Retry item antrean tunggal
  const handleRetryItem = async (id: string) => {
    try {
      await fetch("/api/queue/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: id }),
      })
      fetchQueue()
      fetchBatches()
    } catch (err) {
      console.error("[QueuePage] Error retrying item:", err)
    }
  }

  // Proses semua item pending dalam antrean (jalankan worker batch 5)
  const handleProcessQueue = async () => {
    setIsProcessing(true)
    setProcessResult(null)
    let totalProcessed = 0
    try {
      // Loop sampai tidak ada lagi item queued_input
      for (let round = 0; round < 20; round++) {
        const res = await fetch("/api/queue/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 5 }),
        })
        const data = await res.json()
        const count = data.processedCount ?? 0
        totalProcessed += count
        if (count === 0) break
        // Refresh tampilan antrean tiap ronde
        await fetchQueue()
        await fetchBatches()
      }
      setProcessResult(`Selesai — ${totalProcessed} item diproses.`)
    } catch (err) {
      console.error("[QueuePage] Error processing queue:", err)
      setProcessResult("Terjadi kesalahan saat memproses antrean.")
    } finally {
      setIsProcessing(false)
      fetchQueue()
      fetchBatches()
    }
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Sesuai Page Layout Standard */}
        <PageHeader
          title="Antrean &amp; Penjadwalan Masal"
          description="Modul 2: Tambahkan daftar kata kunci masal dan kelola jadwal tayang (tanggal acak, pola interval jam, atau instan hari ini)."
          icon={Layers}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchBatches()
                  fetchQueue()
                }}
                disabled={isLoadingBatches || isLoadingQueue || isProcessing}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCw
                  className={`size-3.5 ${
                    isLoadingBatches || isLoadingQueue ? "animate-spin" : ""
                  }`}
                />
                <span>Segarkan Data</span>
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleProcessQueue}
                disabled={isProcessing}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <CalendarClock className={`size-3.5 ${isProcessing ? "animate-spin" : ""}`} />
                <span>{isProcessing ? "Memproses..." : "Proses Antrean"}</span>
              </Button>

              {activeTab !== "create" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("create")}
                  className="gap-1.5 text-xs cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>Buat Batch Baru</span>
                </Button>
              )}
            </div>
          }
        />

        {/* Banner hasil proses */}
        {processResult && (
          <div className="mb-4 rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground flex items-center justify-between">
            <span>{processResult}</span>
            <button
              onClick={() => setProcessResult(null)}
              className="text-muted-foreground hover:text-foreground ml-4 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Konten Halaman Menggunakan Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="create" className="gap-1.5 text-xs">
              <Plus className="size-3.5" />
              <span>Input Kata Kunci</span>
            </TabsTrigger>
            <TabsTrigger value="batches" className="gap-1.5 text-xs">
              <History className="size-3.5" />
              <span>Daftar Batch ({batches.length})</span>
            </TabsTrigger>
            <TabsTrigger value="items" className="gap-1.5 text-xs">
              <ListChecks className="size-3.5" />
              <span>Semua Antrean ({queueItems.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Form Ingesti List Kata Kunci & Penjadwalan */}
          <TabsContent value="create" className="focus-visible:outline-none">
            <KeywordListForm
              sites={sites}
              isLoadingSites={isLoadingSites}
              onSuccess={handleBatchCreated}
            />
          </TabsContent>

          {/* Tab 2: Tabel Riwayat Batch */}
          <TabsContent value="batches" className="focus-visible:outline-none">
            <BatchListTable
              batches={batches}
              isLoading={isLoadingBatches}
              onRefresh={fetchBatches}
            />
          </TabsContent>

          {/* Tab 3: Tabel Semua Item Antrean */}
          <TabsContent value="items" className="focus-visible:outline-none">
            <QueueDataTable
              items={queueItems}
              onRetryItem={handleRetryItem}
            />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </DashboardLayout>
  )
}
