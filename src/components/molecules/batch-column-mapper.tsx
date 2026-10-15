"use client"

import * as React from "react"
import { Eye, Sparkles, Table as TableIcon } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Checkbox } from "@/components/atoms/checkbox"
import { Label } from "@/components/atoms/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/table"
import type { ColumnDefinition, ColumnRole, ParsedBatchItem } from "@/lib/parser/universal-batch-parser"
import { cn } from "@/lib/utils"

export interface BatchColumnMapperProps {
  columns: ColumnDefinition[]
  items: ParsedBatchItem[]
  hasHeader: boolean
  delimiter: string
  totalRows: number
  onToggleHasHeader: (hasHeader: boolean) => void
  onRoleChange: (columnIndex: number, newRole: ColumnRole) => void
  className?: string
}

/** Peran kolom → label, deskripsi, label badge singkat, dan token warna peran. */
const ROLE_OPTIONS: Record<ColumnRole, { label: string; desc: string; short: string; badgeClass: string }> = {
  keyword: {
    label: "Kata kunci utama (topik)",
    desc: "Subjek utama artikel yang wajib ada",
    short: "Kata Kunci",
    badgeClass: "border-primary/20 bg-primary/10 text-primary",
  },
  title: {
    label: "Judul artikel (title)",
    desc: "Judul H1 spesifik untuk artikel",
    short: "Judul",
    badgeClass: "border-warning/30 bg-warning/10 text-warning-strong",
  },
  lsi: {
    label: "Kata kunci sekunder (LSI)",
    desc: "Variasi & istilah turunan yang wajib dibahas",
    short: "LSI",
    badgeClass: "border-success/30 bg-success/10 text-success-strong",
  },
  focus: {
    label: "Fokus pembahasan / brief",
    desc: "Instruksi sudut pandang atau catatan unik",
    short: "Fokus",
    badgeClass: "border-info/30 bg-info/10 text-info-strong",
  },
  category: {
    label: "Kategori WordPress",
    desc: "Nama kategori spesifik untuk artikel ini",
    short: "Kategori",
    badgeClass: "border-ai-process/30 bg-ai-process/10 text-ai-process-strong",
  },
  tags: {
    label: "Tag WordPress",
    desc: "Label atau tag spesifik baris ini",
    short: "Tags",
    badgeClass: "border-ai-process/30 bg-ai-process/10 text-ai-process-strong",
  },
  ignore: {
    label: "Abaikan kolom ini",
    desc: "Kolom ini tidak akan diproses",
    short: "Abaikan",
    badgeClass: "border-border bg-muted text-muted-foreground",
  },
}

const ROLE_ORDER = Object.keys(ROLE_OPTIONS) as ColumnRole[]

function delimiterName(delimiter: string): string {
  if (delimiter === "\t") return "Tab (spreadsheet / Excel)"
  if (delimiter === ";") return "Titik koma (;)"
  if (delimiter === "|") return "Garis tegak (|)"
  return "Koma (,)"
}

/** Wizard pemetaan kolom data batch terstruktur: deteksi pemisah, baris header, peran tiap kolom, pratinjau. */
export function BatchColumnMapper({
  columns,
  items,
  hasHeader,
  delimiter,
  totalRows,
  onToggleHasHeader,
  onRoleChange,
  className,
}: BatchColumnMapperProps) {
  const [showPreview, setShowPreview] = React.useState(false)
  const headerCheckboxId = React.useId()
  const previewId = React.useId()

  if (columns.length <= 1) return null

  const sampleRows = items.slice(0, 4)

  return (
    <section
      aria-label="Pemetaan kolom data"
      className={cn("flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs", className)}
    >
      <div className="flex flex-col justify-between gap-3 border-b border-primary/10 pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-3.5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
              Pemetaan kolom otomatis
              <Badge variant="outline" className="bg-background text-xs font-normal">
                {columns.length} kolom • {totalRows} baris
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pemisah terdeteksi: <span className="font-mono font-medium text-foreground">{delimiterName(delimiter)}</span>.
              Sesuaikan fungsi kolom bila perlu.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id={headerCheckboxId}
              checked={hasHeader}
              onCheckedChange={(checked) => onToggleHasHeader(checked === true)}
            />
            <Label htmlFor={headerCheckboxId} className="cursor-pointer text-xs font-medium select-none">
              Baris pertama adalah nama kolom (header)
            </Label>
          </div>
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setShowPreview((current) => !current)}
            aria-expanded={showPreview}
            aria-controls={previewId}
            className="gap-1 px-0"
          >
            <Eye aria-hidden="true" className="size-3" />
            {showPreview ? "Tutup pratinjau" : "Lihat pratinjau data"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {columns.map((column) => {
          const role = ROLE_OPTIONS[column.role] ?? ROLE_OPTIONS.keyword
          const selectId = `${previewId}-role-${column.index}`
          return (
            <div key={column.index} className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium text-foreground" title={column.name}>
                  {column.name}
                </span>
                <Badge variant="outline" className={cn("shrink-0 px-1.5 text-xs", role.badgeClass)}>
                  {role.short}
                </Badge>
              </div>
              {column.sampleValue && (
                <div className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">
                  Contoh: &ldquo;{column.sampleValue}&rdquo;
                </div>
              )}
              <div className="flex flex-col gap-1 pt-1">
                <Label htmlFor={selectId} className="text-xs text-muted-foreground">
                  Fungsi kolom
                </Label>
                <Select value={column.role} onValueChange={(value) => onRoleChange(column.index, value as ColumnRole)}>
                  <SelectTrigger id={selectId} className="h-8 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    <SelectGroup>
                      {ROLE_ORDER.map((value) => (
                        <SelectItem key={value} value={value}>
                          <span className="flex flex-col py-0.5 text-left">
                            <span className="font-medium text-foreground">{ROLE_OPTIONS[value].label}</span>
                            <span className="text-xs text-muted-foreground">{ROLE_OPTIONS[value].desc}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )
        })}
      </div>

      {showPreview && (
        <div id={previewId} className="mt-1 overflow-hidden rounded-lg border border-border/80 bg-card shadow-2xs">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-foreground">
            <span className="flex items-center gap-1.5">
              <TableIcon aria-hidden="true" className="size-3.5 text-primary" />
              Contoh hasil pemetaan (maks. 4 baris pertama)
            </span>
            <span className="text-xs text-muted-foreground">Total {items.length} artikel siap dibuat</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/15">
                  <TableHead className="w-12 text-center text-xs">#</TableHead>
                  <TableHead className="text-xs">Kata kunci utama</TableHead>
                  <TableHead className="text-xs">Judul artikel (H1)</TableHead>
                  <TableHead className="text-xs">LSI / sekunder</TableHead>
                  <TableHead className="text-xs">Fokus / brief</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                      Belum ada baris data valid yang terurai.
                    </TableCell>
                  </TableRow>
                ) : (
                  sampleRows.map((item, index) => (
                    <TableRow key={item.index} className="text-xs">
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium text-foreground">{item.keyword || "—"}</TableCell>
                      <TableCell>
                        {item.title ? (
                          <span className="font-medium text-foreground">{item.title}</span>
                        ) : (
                          <span className="text-muted-foreground italic">(dibuat otomatis oleh AI)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.lsi && item.lsi.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {item.lsi.map((lsi, lsiIndex) => (
                              <Badge key={`${lsiIndex}-${lsi}`} variant="secondary" className="px-1 text-xs font-normal">
                                {lsi}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{item.focus || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  )
}
