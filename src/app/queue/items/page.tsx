"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ListChecks,
  Plus,
  RefreshCw,
  History,
  Filter,
  X,
  Globe,
  Layers,
  Loader2,
} from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/atoms/card"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/atoms/select"
import {
  QueueDataTable,
  QueueTableItem,
} from "@/components/organisms/queue-data-table"
import { BatchItemData } from "@/components/organisms/batch-keyword/batch-list-table"

function QueueItemsContent() {
  const searchParams = useSearchParams()
  const initialBatchId = searchParams.get("batchId") || "all"

  const [batches, setBatches] = React.useState<BatchItemData[]>([])
  const [isLoadingBatches, setIsLoadingBatches] = React.useState(true)

  const [queueItems, setQueueItems] = React.useState<QueueTableItem[]>([])
  const [isLoadingQueue, setIsLoadingQueue] = React.useState(true)

  const [selectedBatchFilter, setSelectedBatchFilter] = React.useState<string>(initialBatchId)

  // 1. Fetch batches
  const fetchBatches = React.useCallback(async () => {
    setIsLoadingBatches(true)
    try {
      const res = await fetch("/api/batches")
      const data = await res.json()
      if (res.ok && Array.isArray(data.batches)) {
        setBatches(data.batches)
      }
    } catch (err) {
      console.error("[QueueItemsPage] Error fetching batches:", err)
    } finally {
      setIsLoadingBatches(false)
    }
  }, [])

  // 2. Fetch queue items
  const fetchQueue = React.useCallback(async () => {
    setIsLoadingQueue(true)
    try {
      const res = await fetch("/api/queue?onlyBatches=true")
      const data = await res.json()
      if (res.ok && Array.isArray(data.items)) {
        const formatted: QueueTableItem[] = data.items.map(
          (item: {
            id: string
            title: string | null
            target_keyword: string
            batch_id: string | null
            content_batches: { id: string; name: string } | null
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
            batchId: item.batch_id || undefined,
            batchName: item.content_batches?.name || "Batch Tanpa Nama",
          })
        )
        setQueueItems(formatted)
      }
    } catch (err) {
      console.error("[QueueItemsPage] Error fetching queue items:", err)
    } finally {
      setIsLoadingQueue(false)
    }
  }, [])

  React.useEffect(() => {
    fetchBatches()
    fetchQueue()
  }, [fetchBatches, fetchQueue])

  // Update filter jika param URL berubah
  React.useEffect(() => {
    const param = searchParams.get("batchId")
    if (param) {
      setSelectedBatchFilter(param)
    }
  }, [searchParams])

  // Hapus Batch beserta seluruh antreannya
  const handleDeleteBatch = async (batchId: string) => {
    try {
      const res = await fetch(`/api/batches?id=${batchId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        if (selectedBatchFilter === batchId) {
          setSelectedBatchFilter("all")
        }
        await fetchBatches()
        await fetchQueue()
      } else {
        const data = await res.json()
        alert(data.error || "Gagal menghapus batch.")
      }
    } catch (err) {
      console.error("[QueueItemsPage] Error deleting batch:", err)
      alert("Terjadi kesalahan jaringan saat menghapus batch.")
    }
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
      console.error("[QueueItemsPage] Error retrying item:", err)
    }
  }

  // Pengelompokan Item Antrean per Batch
  const groupedBatches = React.useMemo(() => {
    const map = new Map<string, { batchInfo?: BatchItemData; items: QueueTableItem[] }>()

    for (const b of batches) {
      map.set(b.id, { batchInfo: b, items: [] })
    }

    for (const item of queueItems) {
      if (item.batchId) {
        if (!map.has(item.batchId)) {
          map.set(item.batchId, { items: [] })
        }
        map.get(item.batchId)!.items.push(item)
      }
    }

    return Array.from(map.entries()).map(([batchId, data]) => ({
      batchId,
      batchInfo: data.batchInfo,
      items: data.items,
    }))
  }, [batches, queueItems])

  const filteredQueueItems = React.useMemo(() => {
    if (selectedBatchFilter === "all") {
      return queueItems
    }
    return queueItems.filter((i) => i.batchId === selectedBatchFilter)
  }, [queueItems, selectedBatchFilter])

  const activeBatchDetail = batches.find((b) => b.id === selectedBatchFilter)

  return (
    <div className="flex flex-col gap-6">
      {/* Header Halaman */}
      <PageHeader
        title="Antrean Artikel"
        description="Pantau proses pengerjaan artikel oleh AI, jadwal cron per menit, dan status pengiriman ke WordPress."
        icon={ListChecks}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchBatches()
                fetchQueue()
              }}
              disabled={isLoadingBatches || isLoadingQueue}
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
              variant="outline"
              size="sm"
              asChild
              className="gap-1.5 text-xs cursor-pointer"
            >
              <Link href="/batches">
                <History className="size-3.5 text-muted-foreground" />
                <span>Daftar Batch</span>
              </Link>
            </Button>

            <Button
              size="sm"
              asChild
              className="gap-1.5 text-xs cursor-pointer font-semibold shadow-xs"
            >
              <Link href="/queue">
                <Plus className="size-3.5" />
                <span>Buat Batch Baru</span>
              </Link>
            </Button>
          </div>
        }
      />

      {/* Filter Bar Batch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">Filter Batch:</span>
          <div className="w-[240px] sm:w-[320px]">
            <Select
              value={selectedBatchFilter}
              onValueChange={setSelectedBatchFilter}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Pilih Batch..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Semua Batch ({queueItems.length} artikel)
                </SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.name} ({b.completed_items}/{b.total_items})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedBatchFilter !== "all" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedBatchFilter("all")}
            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer self-start sm:self-auto"
          >
            <X className="size-3.5" />
            <span>Tampilkan Semua Batch</span>
          </Button>
        )}
      </div>

      {/* Konten Utama Antrean */}
      {selectedBatchFilter !== "all" ? (
        <div className="flex flex-col gap-3">
          {activeBatchDetail && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{activeBatchDetail.name}</span>
                <Badge variant="outline" className="text-[10px] bg-background">
                  {activeBatchDetail.completed_items} / {activeBatchDetail.total_items} Selesai
                </Badge>
                {activeBatchDetail.wp_sites && (
                  <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                    <Globe className="size-3 text-primary" />
                    {activeBatchDetail.wp_sites.site_name}
                  </span>
                )}
              </div>
            </div>
          )}
          <QueueDataTable
            items={filteredQueueItems}
            onRetryItem={handleRetryItem}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {isLoadingQueue ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Memuat data antrean...</span>
              </div>
            </div>
          ) : groupedBatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-xs text-muted-foreground">
              Belum ada antrean artikel yang terdaftar. Buat batch pertama Anda di menu Bulk Artikel.
            </div>
          ) : (
            groupedBatches.map((group) => {
              const batchTitle =
                group.batchInfo?.name || group.items[0]?.batchName || `Batch ${group.batchId.slice(0, 8)}`
              const siteName =
                group.batchInfo?.wp_sites?.site_name || group.items[0]?.siteName || "WordPress"

              return (
                <Card key={group.batchId} className="border-border/80 bg-card/90 shadow-2xs overflow-hidden">
                  <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/60 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Layers className="size-4 text-primary shrink-0" />
                      <div>
                        <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-2">
                          <span>{batchTitle}</span>
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {group.items.length} artikel
                          </Badge>
                        </CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Globe className="size-3 text-primary" />
                          <span>{siteName}</span>
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBatchFilter(group.batchId)}
                        className="h-7 text-[11px] px-2.5 cursor-pointer"
                      >
                        Fokus Batch Ini
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteBatch(group.batchId)}
                        className="h-7 size-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                        title="Hapus batch ini beserta antreannya"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <QueueDataTable
                      items={group.items}
                      onRetryItem={handleRetryItem}
                    />
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function QueueItemsPage() {
  return (
    <DashboardLayout>
      <PageContainer size="default">
        <React.Suspense
          fallback={
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          }
        >
          <QueueItemsContent />
        </React.Suspense>
      </PageContainer>
    </DashboardLayout>
  )
}
