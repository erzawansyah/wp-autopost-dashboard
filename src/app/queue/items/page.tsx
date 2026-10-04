"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import {
  ListChecks,
  Filter,
  X,
  Globe,
  Layers,
  Zap,
  Loader2,
} from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
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
  const [processingItemIds, setProcessingItemIds] = React.useState<string[]>([])

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

  // 2. Fetch queue items (termasuk hasil dari Tulis Cepat / Quick Writer)
  const fetchQueue = React.useCallback(async () => {
    setIsLoadingQueue(true)
    try {
      const res = await fetch("/api/queue?limit=100")
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
            batchId: item.batch_id || "quick-writer",
            batchName:
              item.content_batches?.name ||
              (item.batch_id ? "Batch Tanpa Nama" : "Tulis Cepat (Quick Writer)"),
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
    const isQuick = batchId === "quick-writer"
    const confirmMsg = isQuick
      ? "Apakah Anda yakin ingin menghapus seluruh riwayat artikel hasil Tulis Cepat?"
      : "Apakah Anda yakin ingin menghapus batch ini beserta seluruh antreannya?"

    if (!window.confirm(confirmMsg)) return

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

  // Retry item gagal, atau jalankan sekarang untuk item berstatus queued_input
  const handleRetryItem = async (id: string) => {
    if (processingItemIds.includes(id)) return

    setProcessingItemIds((prev) => [...prev, id])
    // Optimistic UI update: ubah status ke generating_content
    setQueueItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "generating_content" as const } : item
      )
    )

    try {
      await fetch("/api/queue/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: id, forceNow: true }),
      })
    } catch (err) {
      console.error("[QueueItemsPage] Error retrying item:", err)
    } finally {
      setProcessingItemIds((prev) => prev.filter((itemId) => itemId !== id))
      await fetchQueue()
      await fetchBatches()
    }
  }

  // Pengelompokan Item Antrean per Batch
  // HANYA menampilkan batch yang memiliki minimal 1 artikel (tidak menampilkan batch kosong)
  const groupedBatches = React.useMemo(() => {
    const map = new Map<string, { batchInfo?: BatchItemData; items: QueueTableItem[] }>()

    for (const b of batches) {
      map.set(b.id, { batchInfo: b, items: [] })
    }

    for (const item of queueItems) {
      const bId = item.batchId || "quick-writer"
      if (!map.has(bId)) {
        map.set(bId, { items: [] })
      }
      map.get(bId)!.items.push(item)
    }

    // Filter mutlak: hanya kembalikan batch yang memiliki artikel agar tidak ada card kosong
    return Array.from(map.entries())
      .filter(([_, data]) => data.items.length > 0)
      .map(([batchId, data]) => ({
        batchId,
        batchInfo: data.batchInfo,
        items: data.items,
      }))
  }, [batches, queueItems])

  const filteredQueueItems = React.useMemo(() => {
    if (selectedBatchFilter === "all") {
      return queueItems
    }
    return queueItems.filter((i) => (i.batchId || "quick-writer") === selectedBatchFilter)
  }, [queueItems, selectedBatchFilter])

  const activeBatchDetail = React.useMemo(() => {
    if (selectedBatchFilter === "all") return undefined
    const found = batches.find((b) => b.id === selectedBatchFilter)
    if (found) return found

    if (selectedBatchFilter === "quick-writer") {
      const quickItems = queueItems.filter((i) => (i.batchId || "quick-writer") === "quick-writer")
      const completed = quickItems.filter((i) =>
        i.status === "published_on_wp" || i.status === "saved_draft_on_wp" || i.status === "scheduled_on_wp"
      ).length
      return {
        id: "quick-writer",
        name: "Tulis Cepat (Quick Writer)",
        source_type: "quick_writer",
        execution_mode: "instant",
        status: "completed",
        total_items: quickItems.length,
        completed_items: completed,
        created_at: new Date().toISOString(),
        wp_sites: quickItems[0] ? { id: "wp", site_name: quickItems[0].siteName, base_url: quickItems[0].siteDomain } : null,
      } as BatchItemData
    }

    return undefined
  }, [batches, selectedBatchFilter, queueItems])

  return (
    <div className="flex flex-col gap-6">
      {/* Header Halaman */}
      <PageHeader
        title="Antrean"
        description="Status tiap artikel, jadwal tayang, dan hasil pengiriman ke WordPress."
        icon={ListChecks}
        actions={
          <div className="flex items-center gap-2">
            <BatchModuleActions
              show={["batches", "create"]}
              onRefresh={() => {
                fetchBatches()
                fetchQueue()
              }}
              isRefreshing={isLoadingBatches || isLoadingQueue}
            />
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
                <SelectItem value="all" className="text-xs font-medium">
                  Semua Antrean ({queueItems.length} artikel)
                </SelectItem>
                {groupedBatches.map((g) => {
                  const isQuick = g.batchId === "quick-writer"
                  const name = isQuick
                    ? "⚡ Tulis Cepat (Quick Writer)"
                    : g.batchInfo?.name || `Batch ${g.batchId.slice(0, 8)}`
                  return (
                    <SelectItem key={g.batchId} value={g.batchId} className="text-xs">
                      {name} ({g.items.length} artikel)
                    </SelectItem>
                  )
                })}
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
                {selectedBatchFilter === "quick-writer" ? (
                  <Zap className="size-4 text-amber-500" />
                ) : (
                  <Layers className="size-4 text-primary" />
                )}
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
            processingItemIds={processingItemIds}
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
              Belum ada antrean artikel yang terdaftar. Buat artikel di menu Tulis Cepat atau Tulis Massal.
            </div>
          ) : (
            groupedBatches.map((group) => {
              const isQuick = group.batchId === "quick-writer"
              const batchTitle = isQuick
                ? "Tulis Cepat (Quick Writer)"
                : group.batchInfo?.name || group.items[0]?.batchName || `Batch ${group.batchId.slice(0, 8)}`
              const siteName = isQuick
                ? (group.items[0]?.siteName ? `${group.items[0].siteName}` : "WordPress")
                : group.batchInfo?.wp_sites?.site_name || group.items[0]?.siteName || "WordPress"

              return (
                <Card key={group.batchId} className="border-border/80 bg-card/90 shadow-2xs overflow-hidden">
                  <CardHeader className="py-3 px-4 bg-muted/20 border-b border-border/60 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {isQuick ? (
                        <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                          <Zap className="size-4" />
                        </div>
                      ) : (
                        <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                          <Layers className="size-4" />
                        </div>
                      )}
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
                        title={isQuick ? "Hapus semua artikel hasil Tulis Cepat" : "Hapus batch ini beserta antreannya"}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <QueueDataTable
                      items={group.items}
                      processingItemIds={processingItemIds}
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
