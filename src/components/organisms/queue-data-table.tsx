"use client"

import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table"
import { Checkbox } from "@/components/atoms/checkbox"
import { Button } from "@/components/atoms/button"
import { StatusBadge, PostItemState } from "@/components/molecules/status-badge"
import { SiteBadge } from "@/components/molecules/site-badge"
import { SearchInput } from "@/components/molecules/search-input"
import { EmptyState } from "@/components/molecules/empty-state"
import { Badge } from "@/components/atoms/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import Link from "next/link"
import {
  ExternalLink,
  RefreshCw,
  MoreVertical,
  Play,
  Terminal,
  Trash2,
  Globe,
  Filter,
  X,
  RotateCcw,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu"

export interface QueueTableItem {
  id: string
  title: string
  targetKeyword: string
  siteName: string
  siteDomain: string
  category: string
  status: PostItemState
  wordCount?: number
  scheduledFor?: string
  wpPostUrl?: string
  aiModel?: string
  lastError?: string
  batchId?: string
  batchName?: string
}

interface QueueDataTableProps {
  items: QueueTableItem[]
  initialStatus?: string
  onRetryItem?: (id: string) => void
  onDeleteItem?: (id: string) => void
  onBulkDelete?: (selectedIds: string[]) => Promise<void> | void
  onBulkRun?: (selectedIds: string[]) => void
}

export function QueueDataTable({
  items,
  initialStatus,
  onRetryItem,
  onDeleteItem,
  onBulkDelete,
  onBulkRun,
}: QueueDataTableProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedStatus, setSelectedStatus] = React.useState<string>(initialStatus || "all")
  const [selectedSite, setSelectedSite] = React.useState<string>("all")
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false)

  // Hitung jumlah item dinamis untuk setiap kategori filter
  const statusCounts = React.useMemo(() => {
    let processing = 0
    let published = 0
    let draft = 0
    let scheduled = 0
    let failed = 0

    for (const item of items) {
      if (
        item.status === "queued_input" ||
        item.status === "generating_content" ||
        item.status === "ready_to_sync" ||
        item.status === "syncing_to_wp"
      ) {
        processing++
      } else if (item.status === "published_on_wp") {
        published++
      } else if (item.status === "saved_draft_on_wp") {
        draft++
      } else if (item.status === "scheduled_on_wp") {
        scheduled++
      } else if (item.status === "failed_generation" || item.status === "failed_sync") {
        failed++
      }
    }

    return {
      all: items.length,
      processing,
      published,
      draft,
      scheduled,
      failed,
    }
  }, [items])

  // Ambil daftar unik website dari item
  const uniqueSites = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      if (item.siteDomain && item.siteDomain !== "-") {
        map.set(item.siteDomain, item.siteName)
      }
    }
    return Array.from(map.entries()).map(([domain, name]) => ({ domain, name }))
  }, [items])

  // Evaluasi kecocokan status (mendukung group maupun status eksak)
  const isStatusMatching = (itemStatus: PostItemState, filterId: string): boolean => {
    if (filterId === "all") return true
    if (filterId === "processing" || filterId === "generating_content") {
      return (
        itemStatus === "queued_input" ||
        itemStatus === "generating_content" ||
        itemStatus === "ready_to_sync" ||
        itemStatus === "syncing_to_wp"
      )
    }
    if (filterId === "published" || filterId === "published_on_wp") {
      return itemStatus === "published_on_wp"
    }
    if (filterId === "draft" || filterId === "saved_draft_on_wp") {
      return itemStatus === "saved_draft_on_wp"
    }
    if (filterId === "scheduled" || filterId === "scheduled_on_wp") {
      return itemStatus === "scheduled_on_wp"
    }
    if (filterId === "failed" || filterId === "failed_sync" || filterId === "failed_generation") {
      return itemStatus === "failed_generation" || itemStatus === "failed_sync"
    }
    if (filterId === "ready_to_sync") {
      return itemStatus === "ready_to_sync"
    }
    return itemStatus === filterId
  }

  // Filter items berdasarkan pencarian, status, dan situs
  const filteredItems = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      const matchSearch =
        !q ||
        (item.title || "").toLowerCase().includes(q) ||
        (item.targetKeyword || "").toLowerCase().includes(q) ||
        (item.siteName || "").toLowerCase().includes(q) ||
        (item.siteDomain || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q)

      const matchStatus = isStatusMatching(item.status, selectedStatus)
      const matchSite = selectedSite === "all" || item.siteDomain === selectedSite

      return matchSearch && matchStatus && matchSite
    })
  }, [items, searchQuery, selectedStatus, selectedSite])

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredItems.map((i) => i.id))
    }
  }

  const toggleSelectItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const isAllSelected =
    filteredItems.length > 0 && selectedIds.length === filteredItems.length

  const handleBulkDelete = async () => {
    if (!onBulkDelete || selectedIds.length === 0) return
    if (
      !window.confirm(
        `Hapus ${selectedIds.length} artikel yang dipilih? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return

    setIsBulkDeleting(true)
    try {
      await onBulkDelete(selectedIds)
      setSelectedIds([])
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const isFilterActive =
    searchQuery.trim().length > 0 || selectedStatus !== "all" || selectedSite !== "all"

  const handleResetFilters = () => {
    setSearchQuery("")
    setSelectedStatus("all")
    setSelectedSite("all")
  }

  // Definisi opsi filter status
  const filterPills = [
    { id: "all", label: "Semua", count: statusCounts.all },
    { id: "processing", label: "Dalam Proses", count: statusCounts.processing },
    { id: "published", label: "Terbit di Web", count: statusCounts.published },
    { id: "draft", label: "Draf di Web", count: statusCounts.draft },
    { id: "scheduled", label: "Terjadwal", count: statusCounts.scheduled },
    { id: "failed", label: "Gagal", count: statusCounts.failed, isDestructive: statusCounts.failed > 0 },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Table Toolbar: Pencarian, Filter Website, & Reset */}
      <div className="flex flex-col gap-2.5 bg-card p-3 rounded-xl border border-border/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery("")}
              placeholder="Cari judul, topik, kategori, atau domain..."
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Dropdown Situs WordPress */}
            {uniqueSites.length > 0 && (
              <div className="w-[180px] sm:w-[200px]">
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <div className="flex items-center gap-1.5 truncate">
                      <Globe className="size-3.5 text-primary shrink-0" />
                      <SelectValue placeholder="Pilih Situs..." />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      Semua Website ({items.length})
                    </SelectItem>
                    {uniqueSites.map((site) => (
                      <SelectItem key={site.domain} value={site.domain} className="text-xs">
                        {site.name} ({site.domain})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tombol Reset Filter jika ada filter yang aktif */}
            {isFilterActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground cursor-pointer px-2"
                title="Reset semua filter ke tampilan default"
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filter Quick Pills dengan Badge Jumlah */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 pt-0.5 border-t border-border/60">
          {filterPills.map((filter) => {
            const isSelected = selectedStatus === filter.id

            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setSelectedStatus(filter.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                }`}
              >
                <span>{filter.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                    isSelected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : filter.isDestructive
                      ? "bg-destructive/15 text-destructive font-bold"
                      : "bg-background/80 text-muted-foreground"
                  }`}
                >
                  {filter.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Batch Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-primary">
              {selectedIds.length} artikel dipilih
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onBulkRun && (
              <Button
                size="xs"
                variant="default"
                onClick={() => onBulkRun(selectedIds)}
                className="cursor-pointer gap-1.5"
              >
                <Play className="size-3" />
                Kirim Sekarang
              </Button>
            )}
            {onBulkDelete && (
              <Button
                size="xs"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="cursor-pointer gap-1.5"
              >
                {isBulkDeleting ? (
                  <RefreshCw className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                {isBulkDeleting ? "Menghapus..." : `Hapus ${selectedIds.length} Artikel`}
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              onClick={() => setSelectedIds([])}
              disabled={isBulkDeleting}
              className="cursor-pointer"
            >
              Batal Pilih
            </Button>
          </div>
        </div>
      )}


      {/* Table Container */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10 text-center">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Pilih semua baris"
                />
              </TableHead>
              <TableHead className="text-xs font-semibold">Judul &amp; Topik</TableHead>
              <TableHead className="text-xs font-semibold">Website Tujuan</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Kategori</TableHead>
              <TableHead className="text-xs font-semibold text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-64 text-center">
                  <EmptyState
                    title="Tidak ada artikel yang cocok"
                    description="Coba ubah kata kunci pencarian atau ganti filter status di atas."
                    actionLabel={isFilterActive ? "Reset Semua Filter" : undefined}
                    onAction={isFilterActive ? handleResetFilters : undefined}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id)

                return (
                  <TableRow
                    key={item.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    {/* Checkbox Col */}
                    <TableCell className="text-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectItem(item.id)}
                        aria-label={`Pilih artikel ${item.title}`}
                      />
                    </TableCell>

                    {/* Title & Keyword Col */}
                    <TableCell className="max-w-md">
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/posts/${item.id}`}
                          className="text-xs font-bold text-foreground line-clamp-1 hover:text-primary transition-colors cursor-pointer"
                        >
                          {item.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono bg-muted/60 px-1 rounded">
                            Topik: {item.targetKeyword}
                          </span>
                          {item.batchName && (
                            <Badge
                              variant="outline"
                              className={`text-[9px] h-4 px-1.5 font-normal tracking-tight ${
                                item.batchId === "quick-writer"
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                  : "bg-primary/5 text-primary border-primary/20"
                              }`}
                            >
                              {item.batchId === "quick-writer" ? "⚡ Tulis Cepat" : item.batchName}
                            </Badge>
                          )}
                          {item.wordCount && (
                            <span>{item.wordCount.toLocaleString()} kata</span>
                          )}
                          {item.aiModel && (
                            <span className="text-primary/80 font-medium">
                              {item.aiModel}
                            </span>
                          )}
                        </div>
                        {item.lastError &&
                          !["published_on_wp", "saved_draft_on_wp", "scheduled_on_wp"].includes(
                            item.status
                          ) && (
                            <span className="text-[10px] text-destructive font-medium truncate max-w-sm mt-0.5">
                              Kendala: {item.lastError}
                            </span>
                          )}
                      </div>
                    </TableCell>

                    {/* Site Col */}
                    <TableCell>
                      <SiteBadge
                        siteName={item.siteName}
                        domain={item.siteDomain}
                      />
                    </TableCell>

                    {/* Status Col */}
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>

                    {/* Category Col */}
                    <TableCell>
                      <span className="text-xs text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md font-medium">
                        {item.category || "Umum"}
                      </span>
                    </TableCell>

                    {/* Action Col */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.wpPostUrl && (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon-xs"
                            className="size-7 text-muted-foreground hover:text-foreground"
                          >
                            <a
                              href={item.wpPostUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Buka di WordPress"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          </Button>
                        )}

                        {item.status === "failed_sync" && onRetryItem && (
                          <Button
                            variant="outline"
                            size="icon-xs"
                            onClick={() => onRetryItem(item.id)}
                            className="size-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                            title="Kirim ulang ke WordPress"
                          >
                            <RefreshCw className="size-3.5" />
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="size-7 text-muted-foreground"
                            >
                              <MoreVertical className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link
                                href={`/posts/${item.id}`}
                                className="flex items-center gap-1.5"
                              >
                                <Terminal className="size-3.5 text-primary" />
                                <span>Lihat Detail &amp; Log</span>
                              </Link>
                            </DropdownMenuItem>
                            {item.wpPostUrl && (
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <a
                                  href={item.wpPostUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5"
                                >
                                  <ExternalLink className="size-3.5" />
                                  <span>Buka di WordPress</span>
                                </a>
                              </DropdownMenuItem>
                            )}
                            {item.status === "failed_sync" && (
                              <DropdownMenuItem
                                onClick={() => onRetryItem && onRetryItem(item.id)}
                                className="cursor-pointer text-primary"
                              >
                                Coba Kirim Ulang
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDeleteItem && onDeleteItem(item.id)}
                              className="cursor-pointer text-destructive focus:text-destructive"
                            >
                              Hapus dari Daftar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
