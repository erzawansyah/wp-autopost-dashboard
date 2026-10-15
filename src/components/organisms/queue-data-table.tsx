"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, SearchX } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Checkbox } from "@/components/atoms/checkbox"
import { Skeleton } from "@/components/atoms/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/table"
import { EmptyState } from "@/components/molecules/empty-state"
import { SiteBadge } from "@/components/molecules/site-badge"
import { StatusBadge } from "@/components/molecules/status-badge"
import { QueueBulkBar } from "@/components/organisms/queue/queue-bulk-bar"
import { QueueGroupRow, type QueueBatchGroupInfo } from "@/components/organisms/queue/queue-group-row"
import {
  QueueCategoryCell,
  QueueRowActions,
  QueueScheduleCell,
  QueueTitleCell,
} from "@/components/organisms/queue/queue-table-cells"
import {
  ALL_SITES,
  QueueTableToolbar,
  type SiteFilterOption,
  type StatusFilter,
} from "@/components/organisms/queue/queue-table-toolbar"
import { apiFetch } from "@/lib/api/client"
import { getOptimisticRetryState, getQueueRetryAction, type QueueRetryAction } from "@/lib/queue/retry-actions"
import { compareStates, countStatusGroups, statusGroupOf } from "@/lib/queue/states"
import {
  batchIdOf,
  matchesQueueSearch,
  scheduleKindOf,
  scheduleTimeOf,
  type QueueTableItem,
} from "@/lib/queue/table-model"
import { useConfirm } from "@/lib/ui/confirm"
import { cn } from "@/lib/utils"
import type { PostItemState } from "@/types/queue"

const RETRY_RESULT_STATES: readonly PostItemState[] = ["queued_input", "ready_to_sync"]

/**
 * Menjadwalkan ulang item lewat endpoint yang sesuai aksi (2xx = sudah dijadwalkan ulang, belum tentu selesai):
 * - `resync` → `POST /api/posts/[id]` (202; kirim ulang naskah tersimpan, menghormati jadwal tayang);
 * - `run`/`regenerate` → `POST /api/queue/process` dengan `postId`; hanya `run` yang memakai `forceNow`.
 * Mengembalikan state baru; melempar `ApiClientError` (pesan Indonesia siap tampil) bila gagal.
 */
export async function scheduleQueueItemRetry(id: string, action: QueueRetryAction): Promise<PostItemState> {
  const data =
    action === "resync"
      ? await apiFetch<{ state?: unknown }>(`/api/posts/${encodeURIComponent(id)}`, { method: "POST" })
      : await apiFetch<{ state?: unknown }>("/api/queue/process", {
          method: "POST",
          body: action === "run" ? { postId: id, forceNow: true } : { postId: id },
        })
  return RETRY_RESULT_STATES.find((state) => state === data.state) ?? getOptimisticRetryState(action)
}

// ---------------------------------------------------------------------------
// Definisi kolom (stabil di level modul; data dinamis lewat `meta`)
// ---------------------------------------------------------------------------

interface QueueTableMeta {
  processingIds: ReadonlySet<string>
  now: number
  showBatchBadge: boolean
  onRetryItem?: (id: string) => void
  onDeleteItem?: (id: string) => void
}

function metaOf(table: TanstackTable<QueueTableItem>): QueueTableMeta {
  return table.options.meta as QueueTableMeta
}

const statusGroupFilter: FilterFn<QueueTableItem> = (row, _columnId, value: StatusFilter) =>
  value === "all" || statusGroupOf(row.original.status) === value

const siteFilter: FilterFn<QueueTableItem> = (row, _columnId, value: string) =>
  value === ALL_SITES || row.original.siteDomain === value

const searchFilter: FilterFn<QueueTableItem> = (row, _columnId, value: string) => matchesQueueSearch(row.original, value)

const COLUMNS: ColumnDef<QueueTableItem>[] = [
  {
    id: "select",
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(checked) => table.toggleAllRowsSelected(checked === true)}
        aria-label="Pilih semua artikel yang tampil"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        aria-label={`Pilih artikel ${row.original.title}`}
      />
    ),
  },
  {
    id: "batch",
    accessorFn: (item) => batchIdOf(item),
    enableGrouping: true,
    enableSorting: false,
  },
  {
    id: "title",
    header: "Judul & Topik",
    accessorFn: (item) => item.title,
    sortingFn: "text",
    filterFn: searchFilter,
    cell: ({ row, table }) => <QueueTitleCell item={row.original} showBatch={metaOf(table).showBatchBadge} />,
  },
  {
    id: "site",
    header: "Website Tujuan",
    accessorFn: (item) => item.siteName,
    sortingFn: "text",
    filterFn: siteFilter,
    cell: ({ row }) => <SiteBadge siteName={row.original.siteName} domain={row.original.siteDomain} />,
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (item) => item.status,
    sortingFn: (a, b) => compareStates(a.original.status, b.original.status),
    filterFn: statusGroupFilter,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "time",
    header: "Waktu & Publikasi",
    accessorFn: (item) => {
      const time = scheduleTimeOf(item, scheduleKindOf(item, Date.now()))
      return time ? Date.parse(time) : 0
    },
    sortingFn: "basic",
    cell: ({ row, table }) => <QueueScheduleCell item={row.original} now={metaOf(table).now} />,
  },
  {
    id: "category",
    header: "Kategori",
    enableSorting: false,
    cell: ({ row }) => <QueueCategoryCell categories={row.original.categories} />,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    enableSorting: false,
    cell: ({ row, table }) => {
      const meta = metaOf(table)
      return (
        <QueueRowActions
          item={row.original}
          retryAction={getQueueRetryAction(row.original.status)}
          isProcessing={meta.processingIds.has(row.original.id)}
          onRetry={meta.onRetryItem}
          onDelete={meta.onDeleteItem}
        />
      )
    },
  },
]

const VISIBLE_COLUMN_COUNT = COLUMNS.length - 1 // kolom `batch` hanya kunci pengelompokan

/** Waktu sekarang yang diperbarui tiap menit (label "Rencana Tayang" berubah tanpa reload). */
function useMinuteClock(): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function uniqueSites(items: QueueTableItem[]): SiteFilterOption[] {
  const byDomain = new Map<string, string>()
  for (const item of items) {
    if (item.siteDomain && item.siteDomain !== "-") byDomain.set(item.siteDomain, item.siteName)
  }
  return Array.from(byDomain, ([domain, name]) => ({ domain, name }))
}

function groupInfoFor(batchId: string, items: QueueTableItem[], groups?: ReadonlyMap<string, QueueBatchGroupInfo>) {
  const known = groups?.get(batchId)
  if (known) return known
  const first = items[0]
  return { id: batchId, name: first?.batchName || "Batch tanpa nama", siteName: first?.siteName }
}

export interface QueueDataTableProps {
  items: QueueTableItem[]
  processingItemIds?: readonly string[]
  onRetryItem?: (id: string) => void
  onDeleteItem?: (id: string) => void
  /** Hapus massal (setelah konfirmasi di tabel). */
  onBulkDelete?: (ids: string[]) => Promise<unknown> | void
  /** Proses ulang massal (jalankan/tulis ulang/kirim ulang sesuai state tiap item). */
  onBulkRetry?: (ids: string[]) => Promise<unknown> | void
  /** Awal tampilan dikelompokkan per batch (pengguna dapat mengubahnya di toolbar). */
  defaultGrouped?: boolean
  /** Info batch (nama, situs, progres) untuk kepala grup. */
  batchGroups?: ReadonlyMap<string, QueueBatchGroupInfo>
  /** Aksi di kepala grup (mis. fokus batch, hapus batch). */
  renderGroupActions?: (group: QueueBatchGroupInfo) => React.ReactNode
  /** Filter tambahan di toolbar (mis. pemilih batch). */
  toolbarFilters?: React.ReactNode
  /** Panel saat belum ada artikel sama sekali. */
  emptyState?: React.ReactNode
  /** Data awal belum tersedia (tampilkan kerangka). */
  isLoading?: boolean
}

/**
 * Tabel antrean berbasis TanStack Table: pencarian, filter status/situs, sorting, pengelompokan per batch
 * (termasuk grup virtual Tulis Cepat), seleksi baris untuk aksi massal, dan aksi ulang per baris.
 * Data & mutasi dimiliki pemanggil (organism halaman); tabel hanya mengelola state tampilan.
 */
export function QueueDataTable({
  items,
  processingItemIds,
  onRetryItem,
  onDeleteItem,
  onBulkDelete,
  onBulkRetry,
  defaultGrouped = false,
  batchGroups,
  renderGroupActions,
  toolbarFilters,
  emptyState,
  isLoading = false,
}: QueueDataTableProps) {
  const confirm = useConfirm()
  const now = useMinuteClock()
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<StatusFilter>("all")
  const [site, setSite] = React.useState(ALL_SITES)
  const [grouped, setGrouped] = React.useState(defaultGrouped)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [expanded, setExpanded] = React.useState<ExpandedState>(true)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [isBulkBusy, setIsBulkBusy] = React.useState(false)

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () => [
      { id: "title", value: search },
      { id: "status", value: status },
      { id: "site", value: site },
    ],
    [search, status, site]
  )

  const processingIds = React.useMemo(() => new Set(processingItemIds), [processingItemIds])
  const meta = React.useMemo<QueueTableMeta>(
    () => ({ processingIds, now, showBatchBadge: !grouped, onRetryItem, onDeleteItem }),
    [processingIds, now, grouped, onRetryItem, onDeleteItem]
  )

  // TanStack Table v8 mengembalikan fungsi yang tidak dapat di-memo React Compiler; komponen ini memang
  // dilewati compiler (proyek belum memakai React Compiler) dan state tabel dikelola TanStack sendiri.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns: COLUMNS,
    meta,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      expanded,
      grouping: grouped ? ["batch"] : [],
      columnVisibility: { batch: false },
    },
    getRowId: (item) => item.id,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    enableRowSelection: (row) => !row.getIsGrouped(),
    groupedColumnMode: false,
    autoResetExpanded: false,
    // Tabel ini tanpa paginasi. Bila aktif, TanStack menjadwalkan `resetPageIndex` (setState) lewat microtask dari
    // dalam render setiap kali row model berubah; saat tabel belum ter-commit (hydrasi) React memperingatkan
    // "Can't perform a React state update on a component that hasn't mounted yet".
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  const statusCounts = React.useMemo(() => countStatusGroups(items.map((item) => item.status)), [items])
  const sites = React.useMemo(() => uniqueSites(items), [items])
  const isFilterActive = search.trim().length > 0 || status !== "all" || site !== ALL_SITES

  const selectedItems = table
    .getFilteredSelectedRowModel()
    .flatRows.filter((row) => !row.getIsGrouped())
    .map((row) => row.original)
  const retryableIds = selectedItems.filter((item) => getQueueRetryAction(item.status)).map((item) => item.id)

  function resetFilters() {
    setSearch("")
    setStatus("all")
    setSite(ALL_SITES)
  }

  async function runBulk(action: (ids: string[]) => Promise<unknown> | void, ids: string[]) {
    setIsBulkBusy(true)
    try {
      await action(ids)
      setRowSelection({})
    } finally {
      setIsBulkBusy(false)
    }
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || selectedItems.length === 0) return
    const ok = await confirm({
      title: `Hapus ${selectedItems.length} artikel yang dipilih?`,
      description: "Artikel dihapus dari antrean dan riwayat Panitera. Post yang sudah ada di WordPress tidak ikut terhapus.",
      confirmLabel: "Hapus",
      tone: "destructive",
    })
    if (ok) await runBulk(onBulkDelete, selectedItems.map((item) => item.id))
  }

  const rows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-3">
      <QueueTableToolbar
        search={search}
        onSearchChange={setSearch}
        sites={sites}
        site={site}
        onSiteChange={setSite}
        status={status}
        onStatusChange={setStatus}
        statusCounts={statusCounts}
        grouped={grouped}
        onGroupedChange={setGrouped}
        isFilterActive={isFilterActive}
        onReset={resetFilters}
      >
        {toolbarFilters}
      </QueueTableToolbar>

      {selectedItems.length > 0 && (
        <QueueBulkBar
          selectedCount={selectedItems.length}
          retryableCount={retryableIds.length}
          isBusy={isBulkBusy}
          onRetry={onBulkRetry ? () => void runBulk(onBulkRetry, retryableIds) : undefined}
          onDelete={onBulkDelete ? () => void handleBulkDelete() : undefined}
          onClear={() => setRowSelection({})}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "text-xs font-semibold",
                        header.column.id === "select" && "w-10 text-center",
                        header.column.id === "actions" && "text-right"
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon aria-hidden="true" className="size-3 text-muted-foreground" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && items.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell colSpan={VISIBLE_COLUMN_COUNT}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={VISIBLE_COLUMN_COUNT} className="p-4">
                  {items.length === 0
                    ? (emptyState ?? (
                        <EmptyState
                          icon={Inbox}
                          title="Belum ada artikel di antrean"
                          description="Buat artikel lewat Tulis Cepat, Tulis Massal, atau Tulis Terstruktur."
                        />
                      ))
                    : (
                        <EmptyState
                          icon={SearchX}
                          title="Tidak ada artikel yang cocok"
                          description="Ubah kata kunci pencarian atau filter status/website."
                        >
                          <Button size="sm" onClick={resetFilters}>
                            Reset semua filter
                          </Button>
                        </EmptyState>
                      )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                if (row.getIsGrouped()) {
                  const info = groupInfoFor(
                    String(row.groupingValue),
                    row.subRows.map((subRow) => subRow.original),
                    batchGroups
                  )
                  return (
                    <QueueGroupRow
                      key={row.id}
                      row={row}
                      colSpan={VISIBLE_COLUMN_COUNT}
                      info={info}
                      actions={renderGroupActions?.(info)}
                    />
                  )
                }
                return (
                  <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.id === "select" && "w-10 text-center",
                          cell.column.id === "title" && "max-w-md",
                          cell.column.id === "time" && "whitespace-nowrap"
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
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
