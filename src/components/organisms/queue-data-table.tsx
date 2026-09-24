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
import {
  ExternalLink,
  RefreshCw,
  MoreVertical,
  Play,
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
}

interface QueueDataTableProps {
  items: QueueTableItem[]
  onRetryItem?: (id: string) => void
  onDeleteItem?: (id: string) => void
  onBulkRun?: (selectedIds: string[]) => void
}

export function QueueDataTable({
  items,
  onRetryItem,
  onDeleteItem,
  onBulkRun,
}: QueueDataTableProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all")
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  // Filter items based on search and status filter
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.targetKeyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.siteDomain.toLowerCase().includes(searchQuery.toLowerCase())

      const matchStatus =
        selectedStatus === "all" || item.status === selectedStatus

      return matchSearch && matchStatus
    })
  }, [items, searchQuery, selectedStatus])

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

  return (
    <div className="flex flex-col gap-4">
      {/* Table Toolbar & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border/80 shadow-2xs">
        <div className="flex-1 max-w-md">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            placeholder="Cari judul, topik, atau nama website..."
          />
        </div>

        {/* Filter Quick Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "Semua" },
            { id: "generating_content", label: "Sedang Ditulis" },
            { id: "ready_to_sync", label: "Siap Kirim" },
            { id: "published_on_wp", label: "Sudah Terbit" },
            { id: "failed_sync", label: "Gagal Kirim" },
          ].map((filter) => (
            <Button
              key={filter.id}
              variant={selectedStatus === filter.id ? "default" : "outline"}
              size="xs"
              onClick={() => setSelectedStatus(filter.id)}
              className="text-xs h-7 rounded-md cursor-pointer shrink-0 font-medium"
            >
              {filter.label}
            </Button>
          ))}
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
            <Button
              size="xs"
              variant="outline"
              onClick={() => setSelectedIds([])}
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
                        <span className="text-xs font-bold text-foreground line-clamp-1 hover:text-primary transition-colors cursor-pointer">
                          {item.title}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono bg-muted/60 px-1 rounded">
                            Topik: {item.targetKeyword}
                          </span>
                          {item.wordCount && (
                            <span>{item.wordCount.toLocaleString()} kata</span>
                          )}
                          {item.aiModel && (
                            <span className="text-primary/80 font-medium">
                              {item.aiModel}
                            </span>
                          )}
                        </div>
                        {item.lastError && (
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
