"use client"

import * as React from "react"
import {
  Table as TableIcon,
  Eye,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Label } from "@/components/atoms/label"
import { Checkbox } from "@/components/atoms/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table"
import {
  ColumnDefinition,
  ColumnRole,
  ParsedBatchItem,
} from "@/lib/parser/universal-batch-parser"
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

const ROLE_OPTIONS: { value: ColumnRole; label: string; desc: string; badgeClass: string }[] = [
  {
    value: "keyword",
    label: "Kata Kunci Utama (Topik)",
    desc: "Subjek utama artikel yang wajib ada",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  {
    value: "title",
    label: "Judul Artikel (Title)",
    desc: "Judul H1 spesifik untuk artikel",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  },
  {
    value: "lsi",
    label: "Kata Kunci Sekunder (LSI)",
    desc: "Variasi & istilah turunan yang wajib dibahas",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  },
  {
    value: "focus",
    label: "Fokus Pembahasan / Brief",
    desc: "Instruksi sudut pandang atau catatan unik",
    badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  },
  {
    value: "category",
    label: "Kategori WordPress",
    desc: "Nama kategori spesifik untuk artikel ini",
    badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
  },
  {
    value: "tags",
    label: "Tag WordPress",
    desc: "Label atau tag spesifik baris ini",
    badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  },
  {
    value: "ignore",
    label: "Abaikan Kolom Ini",
    desc: "Kolom ini tidak akan diproses",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
]

function getDelimiterName(d: string): string {
  if (d === "\t") return "Tab (Spreadsheet / Excel)"
  if (d === ";") return "Titik Koma (;)"
  if (d === "|") return "Garis Tegak (|)"
  return "Koma (,)"
}

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
  const [showPreviewTable, setShowPreviewTable] = React.useState(false)

  if (columns.length <= 1) {
    return null
  }

  const sampleRows = items.slice(0, 4)

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-4 text-xs transition-all",
        className
      )}
    >
      {/* Baris Status Deteksi & Toggle Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <div className="font-semibold text-foreground flex items-center gap-2">
              <span>Pemetaan Kolom Otomatis (Dynamic Column Mapping)</span>
              <Badge variant="outline" className="text-[10px] font-normal h-4.5 px-1.5 bg-background">
                {columns.length} Kolom • {totalRows} Baris
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Pemisah terdeteksi: <span className="font-mono text-foreground font-medium">{getDelimiterName(delimiter)}</span>. Sesuaikan fungsi kolom jika diperlukan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={hasHeader}
              onCheckedChange={(checked) => onToggleHasHeader(Boolean(checked))}
            />
            <span className="text-[11px] font-medium text-foreground">
              Baris pertama adalah nama kolom (Header)
            </span>
          </label>

          <button
            type="button"
            onClick={() => setShowPreviewTable((prev) => !prev)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium cursor-pointer"
          >
            <Eye className="size-3" />
            <span>{showPreviewTable ? "Tutup Preview" : "Lihat Preview Data"}</span>
          </button>
        </div>
      </div>

      {/* Grid Selector Peran Kolom */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {columns.map((col) => {
          const matchedOpt = ROLE_OPTIONS.find((r) => r.value === col.role) || ROLE_OPTIONS[0]

          return (
            <div
              key={col.index}
              className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card p-3 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium text-foreground truncate text-xs" title={col.name}>
                  {col.name}
                </span>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] h-4.5 px-1.5 shrink-0", matchedOpt.badgeClass)}
                >
                  {matchedOpt.value === "keyword"
                    ? "Kata Kunci"
                    : matchedOpt.value === "title"
                    ? "Judul"
                    : matchedOpt.value === "lsi"
                    ? "LSI"
                    : matchedOpt.value === "focus"
                    ? "Fokus"
                    : matchedOpt.value === "category"
                    ? "Kategori"
                    : matchedOpt.value === "tags"
                    ? "Tags"
                    : "Abaikan"}
                </Badge>
              </div>

              {col.sampleValue && (
                <div className="text-[10px] text-muted-foreground truncate bg-muted/40 px-2 py-1 rounded font-mono">
                  Contoh: &ldquo;{col.sampleValue}&rdquo;
                </div>
              )}

              <div className="pt-1">
                <Label className="text-[10px] text-muted-foreground mb-1 block">
                  Fungsi Kolom:
                </Label>
                <Select
                  value={col.role}
                  onValueChange={(val) => onRoleChange(col.index, val as ColumnRole)}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-xs">
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col text-left py-0.5">
                          <span className="font-medium text-foreground">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabel Preview Mini Data (Accordion / Expandable) */}
      {showPreviewTable && (
        <div className="rounded-lg border border-border/80 bg-card overflow-hidden mt-1 shadow-2xs">
          <div className="px-3 py-2 bg-muted/30 border-b border-border/60 flex items-center justify-between text-[11px] font-medium text-foreground">
            <div className="flex items-center gap-1.5">
              <TableIcon className="size-3.5 text-primary" />
              <span>Contoh Hasil Pemetaan (Maksimal 4 Baris Pertama)</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Total {items.length} artikel siap dibuat
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/15">
                  <TableHead className="w-12 text-center text-[10px]">#</TableHead>
                  <TableHead className="text-[11px]">Kata Kunci Utama</TableHead>
                  <TableHead className="text-[11px]">Judul Artikel (H1)</TableHead>
                  <TableHead className="text-[11px]">LSI / Sekunder</TableHead>
                  <TableHead className="text-[11px]">Fokus / Brief</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                      Belum ada baris data valid yang terurai.
                    </TableCell>
                  </TableRow>
                ) : (
                  sampleRows.map((item, idx) => (
                    <TableRow key={item.index} className="text-xs">
                      <TableCell className="text-center text-[10px] text-muted-foreground font-mono">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {item.keyword || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.title ? (
                          <span className="text-foreground font-medium">{item.title}</span>
                        ) : (
                          <span className="italic text-muted-foreground/60">(Dibuat otomatis oleh AI)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.lsi && item.lsi.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.lsi.map((l, lIdx) => (
                              <Badge
                                key={lIdx}
                                variant="secondary"
                                className="text-[9px] h-4 px-1 font-normal"
                              >
                                {l}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {item.focus || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
