"use client"

import * as React from "react"
import type { Row } from "@tanstack/react-table"
import { ChevronDown, ChevronRight, Globe, Layers, Zap } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Checkbox } from "@/components/atoms/checkbox"
import { TableCell, TableRow } from "@/components/atoms/table"
import type { QueueTableItem } from "@/lib/queue/table-model"
import { QUICK_WRITER_BATCH_ID } from "@/lib/validation/queue"

/** Info grup batch untuk baris kepala grup (dari `/api/batches`; fallback dari baris item). */
export interface QueueBatchGroupInfo {
  id: string
  name: string
  siteName?: string
  completedItems?: number
  totalItems?: number
}

interface QueueGroupRowProps {
  row: Row<QueueTableItem>
  colSpan: number
  info: QueueBatchGroupInfo
  /** Aksi grup dari halaman (fokus batch, hapus batch, …). */
  actions?: React.ReactNode
}

/** Baris kepala grup batch: pilih semua item grup, buka/tutup, nama, jumlah, situs, progres, aksi. */
export function QueueGroupRow({ row, colSpan, info, actions }: QueueGroupRowProps) {
  const isQuick = info.id === QUICK_WRITER_BATCH_ID
  const expanded = row.getIsExpanded()
  const allSelected = row.getIsAllSubRowsSelected()
  const someSelected = row.getIsSomeSelected()
  const Icon = isQuick ? Zap : Layers
  const Toggle = expanded ? ChevronDown : ChevronRight

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/40">
      <TableCell className="w-10 text-center">
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
          aria-label={`Pilih semua artikel di ${info.name}`}
        />
      </TableCell>
      <TableCell colSpan={colSpan - 1} className="py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={row.getToggleExpandedHandler()}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Tutup" : "Buka"} grup ${info.name}`}
            >
              <Toggle aria-hidden="true" className="size-4" />
            </Button>
            <span
              aria-hidden="true"
              className={
                isQuick
                  ? "flex size-7 shrink-0 items-center justify-center rounded-md border border-warning/30 bg-warning/10 text-warning-strong"
                  : "flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary"
              }
            >
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                <span className="truncate">{info.name}</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {row.subRows.length} artikel
                </Badge>
                {info.totalItems !== undefined && info.completedItems !== undefined && (
                  <Badge variant="outline" className="bg-background font-mono text-xs font-normal">
                    {info.completedItems}/{info.totalItems} selesai
                  </Badge>
                )}
              </span>
              {info.siteName && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe aria-hidden="true" className="size-3 text-primary" />
                  {info.siteName}
                </span>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      </TableCell>
    </TableRow>
  )
}
