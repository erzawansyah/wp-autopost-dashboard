"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog"
import { Button } from "@/components/atoms/button"
import { Textarea } from "@/components/atoms/textarea"
import { FormField } from "@/components/molecules/form-field"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { Upload, FileText, Clock, Zap, AlertCircle } from "lucide-react"

interface BulkBatchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit?: (data: {
    siteId: string
    sourceType: "csv" | "paste"
    keywords: string[]
    executionMode: "scheduled_drip" | "immediate"
  }) => void
}

export function BulkBatchModal({
  open,
  onOpenChange,
  onSubmit,
}: BulkBatchModalProps) {
  const [siteId, setSiteId] = React.useState("site-1")
  const [sourceType, setSourceType] = React.useState<"csv" | "paste">("paste")
  const [pastedKeywords, setPastedKeywords] = React.useState("")
  const [executionMode, setExecutionMode] = React.useState<"scheduled_drip" | "immediate">("scheduled_drip")
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [fileKeywords, setFileKeywords] = React.useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) {
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
        // Assume first line is header if it contains keyword
        const rows = lines[0]?.toLowerCase().includes("keyword") ? lines.slice(1) : lines
        setFileKeywords(rows.slice(0, 500))
      }
    }
    reader.readAsText(file)
  }

  const activeKeywords =
    sourceType === "csv"
      ? fileKeywords
      : pastedKeywords
          .split(/\r?\n/)
          .map((k) => k.trim())
          .filter((k) => k.length > 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeKeywords.length === 0) return

    setIsSubmitting(true)
    setTimeout(() => {
      if (onSubmit) {
        onSubmit({
          siteId,
          sourceType,
          keywords: activeKeywords,
          executionMode,
        })
      }
      setIsSubmitting(false)
      onOpenChange(false)
      // Reset
      setPastedKeywords("")
      setFileName(null)
      setFileKeywords([])
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-bold text-sm mb-1">
            <Upload className="size-4 text-accent" />
            <span>Modul 2: Bulk Keyword Batch</span>
          </div>
          <DialogTitle className="text-lg">Impor & Jadwalkan Antrean Masal</DialogTitle>
          <DialogDescription className="text-xs">
            Unggah berkas CSV atau tempel daftar kata kunci untuk diproduksi dan dijadwalkan secara bertahap.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {/* Target Website Selector */}
          <FormField label="Website Target WordPress" required>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Pilih situs target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="site-1">Nusantara Living (nusantaraliving.co.id)</SelectItem>
                <SelectItem value="site-2">Finansial Kita (finansialkita.com)</SelectItem>
                <SelectItem value="site-3">Otomotif Trend (otomotiftrend.id)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          {/* Ingestion Source Tabs */}
          <Tabs
            value={sourceType}
            onValueChange={(val) => setSourceType(val as "csv" | "paste")}
            className="w-full"
          >
            <TabsList className="grid grid-cols-2 w-full h-9">
              <TabsTrigger value="paste" className="text-xs gap-1.5 cursor-pointer">
                <FileText className="size-3.5" />
                <span>Paste Daftar Baris</span>
              </TabsTrigger>
              <TabsTrigger value="csv" className="text-xs gap-1.5 cursor-pointer">
                <Upload className="size-3.5" />
                <span>Unggah File CSV / XLSX</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="mt-3">
              <FormField
                label="Daftar Kata Kunci (1 Keyword per Baris)"
                hint="Maksimal 500 keyword per batch"
              >
                <Textarea
                  value={pastedKeywords}
                  onChange={(e) => setPastedKeywords(e.target.value)}
                  placeholder="panduan investasi emas 2026&#10;reksadana syariah pemula&#10;strategi dividen saham bbri"
                  rows={6}
                  className="font-mono text-xs resize-none"
                />
              </FormField>
            </TabsContent>

            <TabsContent value="csv" className="mt-3">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/80 rounded-xl bg-muted/20 text-center">
                <Upload className="size-8 text-muted-foreground mb-2" />
                <span className="text-xs font-semibold text-foreground mb-1">
                  {fileName ? fileName : "Klik atau seret berkas CSV ke sini"}
                </span>
                <span className="text-[11px] text-muted-foreground mb-3">
                  Format .csv atau .xlsx (Maks 5MB)
                </span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  id="csv-file-input"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => document.getElementById("csv-file-input")?.click()}
                  className="cursor-pointer"
                >
                  Pilih File Dari Komputer
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Keyword Counter Feedback */}
          <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-secondary/60">
            <span className="text-muted-foreground">Jumlah Keyword Terdeteksi:</span>
            <span className="font-mono font-bold text-foreground">
              {activeKeywords.length} artikel
            </span>
          </div>

          {/* Execution Mode Selector */}
          <div className="p-3 rounded-lg border border-border/70 bg-card flex flex-col gap-2">
            <span className="text-xs font-semibold">Mode Penjadwalan & Penerbitan</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExecutionMode("scheduled_drip")}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  executionMode === "scheduled_drip"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <Clock className="size-4 text-accent mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">
                    Smart Drip-Feed (Humanized)
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    Jeda acak 15-45 mnt di jam aktif untuk mencegah jejak bot Google
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExecutionMode("immediate")}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  executionMode === "immediate"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <Zap className="size-4 text-primary mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">
                    Immediate Sequential
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    Proses langsung antrean dengan throttling aman (maks 2 paralel)
                  </span>
                </div>
              </button>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || activeKeywords.length === 0}
              className="cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Upload className="size-3.5" />
              <span>
                {isSubmitting
                  ? "Menambahkan Batch..."
                  : `Jadwalkan ${activeKeywords.length} Artikel`}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
