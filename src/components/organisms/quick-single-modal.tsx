"use client"

import * as React from "react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Textarea } from "@/components/atoms/textarea"
import { FormField } from "@/components/molecules/form-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { Switch } from "@/components/atoms/switch"
import {
  Sparkles,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
} from "lucide-react"

interface WpSiteOption {
  id: string
  site_name: string
  base_url: string
}

interface QuickSingleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function QuickSingleModal({
  open,
  onOpenChange,
  onSuccess,
}: QuickSingleModalProps) {
  const [sites, setSites] = React.useState<WpSiteOption[]>([])
  const [isLoadingSites, setIsLoadingSites] = React.useState(false)

  const [siteId, setSiteId] = React.useState("")
  const [keyword, setKeyword] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [tags, setTags] = React.useState("")
  const [customBrief, setCustomBrief] = React.useState("")
  const [actionStatus, setActionStatus] = React.useState<"draft" | "publish">("draft")
  const [featuredImage, setFeaturedImage] = React.useState(true)
  const [imageSource, setImageSource] = React.useState<"unsplash" | "url" | "ai">("unsplash")

  // Pipeline execution state
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [progressStep, setProgressStep] = React.useState<string | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [completedResult, setCompletedResult] = React.useState<{
    title: string
    state: string
    wpPostUrl?: string
    message: string
  } | null>(null)

  // Fetch sites whenever modal opens
  React.useEffect(() => {
    if (!open) return

    let isMounted = true

    fetch("/api/sites")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to fetch"))))
      .then((data) => {
        if (!isMounted) return
        if (data.sites && data.sites.length > 0) {
          setSites(data.sites)
          setSiteId((prev) => (prev ? prev : data.sites[0].id))
        } else {
          setSites([])
          setSiteId("")
        }
      })
      .catch((err) => {
        console.error("Gagal memuat situs:", err)
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSites(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [open])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setErrorMsg(null)
      setProgressStep(null)
      setCompletedResult(null)
    }
    onOpenChange(newOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim() || !siteId) return

    setIsSubmitting(true)
    setErrorMsg(null)
    setCompletedResult(null)
    setProgressStep("Menulis artikel dengan sudut pandang praktis...")

    try {
      const res = await fetch("/api/posts/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          keyword: keyword.trim(),
          category: category.trim(),
          tags: tags.trim(),
          customBrief: customBrief.trim(),
          actionStatus,
          featuredImage,
          imageSource,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Gagal memproses artikel.")
        return
      }

      setCompletedResult({
        title: data.title,
        state: data.state,
        wpPostUrl: data.wpPostUrl,
        message:
          actionStatus === "publish"
            ? "Artikel berhasil tayang di blog WordPress Anda."
            : "Artikel berhasil disimpan sebagai draf di WordPress.",
      })

      if (onSuccess) {
        onSuccess()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gangguan jaringan saat memproses artikel"
      setErrorMsg(msg)
    } finally {
      setIsSubmitting(false)
      setProgressStep(null)
    }
  }

  const handleResetAndNew = () => {
    setCompletedResult(null)
    setKeyword("")
    setCategory("")
    setTags("")
    setCustomBrief("")
    setErrorMsg(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-bold text-sm mb-1">
            <Sparkles className="size-4 text-accent" />
            <span>Tulis Cepat</span>
          </div>
          <DialogTitle className="text-lg">Tulis 1 Artikel &amp; Kirim ke Blog</DialogTitle>
          <DialogDescription className="text-xs">
            Artikel ditulis dengan gaya mengalir wajar, contoh nyata, dan langsung terkirim ke WordPress tujuan.
          </DialogDescription>
        </DialogHeader>

        {completedResult ? (
          <div className="flex flex-col gap-4 py-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                <CheckCircle2 className="size-5 shrink-0" />
                <span>{completedResult.message}</span>
              </div>
              <div className="text-xs text-foreground/90 font-medium">
                Judul: <span className="font-semibold">{completedResult.title}</span>
              </div>
              {completedResult.wpPostUrl && (
                <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Tautan Artikel:</span>
                  <a
                    href={completedResult.wpPostUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
                  >
                    <span>Buka di WordPress</span>
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetAndNew}
                className="cursor-pointer text-xs"
              >
                + Tulis Artikel Lain
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenChange(false)}
                className="cursor-pointer text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                Tutup
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {isSubmitting && progressStep && (
              <div className="p-3.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs flex items-center gap-3">
                <Loader2 className="size-4 animate-spin shrink-0 text-primary" />
                <div className="flex flex-col">
                  <span className="font-semibold">Sedang Mengolah Tulisan...</span>
                  <span className="text-[11px] text-muted-foreground">{progressStep}</span>
                </div>
              </div>
            )}

            {/* Target Website Selector */}
            <FormField label="Pilih Website Tujuan" required>
              {isLoadingSites ? (
                <div className="h-9 flex items-center text-xs text-muted-foreground gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Memuat situs...</span>
                </div>
              ) : sites.length === 0 ? (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs flex flex-col gap-2">
                  <span>Belum ada website yang terhubung.</span>
                  <Link
                    href="/sites"
                    onClick={() => handleOpenChange(false)}
                    className="flex items-center gap-1 font-semibold underline text-primary"
                  >
                    <span>Sambungkan website dulu</span>
                    <Plus className="size-3.5" />
                  </Link>
                </div>
              ) : (
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pilih website tujuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.site_name} ({s.base_url})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            {/* Keyword / Title Input */}
            <FormField
              label="Topik atau Kata Kunci Utama"
              required
              hint="Contoh: Tips hemat renovasi dapur ukuran 2x3"
            >
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tulis topik atau ide artikel..."
                className="h-9 text-xs"
                required
                disabled={isSubmitting}
              />
            </FormField>

            {/* Category & Tags Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Kategori WordPress" hint="Bisa baru atau yang sudah ada di blog">
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Misal: Rumah & Desain"
                  className="h-9 text-xs"
                  disabled={isSubmitting}
                />
              </FormField>
              <FormField label="Tag (Pisahkan dengan koma)" hint="Contoh: renovasi, interior">
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="tag1, tag2..."
                  className="h-9 text-xs"
                  disabled={isSubmitting}
                />
              </FormField>
            </div>

            {/* Custom Brief (Optional override) */}
            <FormField
              label="Catatan Tambahan (Opsional)"
              hint="Beri instruksi khusus misal: tekankan harga terjangkau, jangan terlalu teoritis"
            >
              <Textarea
                value={customBrief}
                onChange={(e) => setCustomBrief(e.target.value)}
                placeholder="Tulis panduan sudut pandang atau poin yang wajib dibahas..."
                rows={3}
                className="text-xs resize-none"
                disabled={isSubmitting}
              />
            </FormField>

            {/* Featured Image Switcher */}
            <div className="p-3 rounded-lg border border-border/70 bg-muted/20 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-primary" />
                  <span className="text-xs font-semibold">Sertakan Gambar Sampul</span>
                </div>
                <Switch
                  checked={featuredImage}
                  onCheckedChange={setFeaturedImage}
                  aria-label="Toggle featured image"
                />
              </div>

              {featuredImage && (
                <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-xs">
                  <span className="text-muted-foreground text-[11px]">Sumber:</span>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { id: "unsplash", label: "Stok Foto (Gratis)" },
                        { id: "url", label: "Tautan URL Gambar" },
                        { id: "ai", label: "Gambar AI" },
                      ] as const
                    ).map((src) => (
                      <Button
                        key={src.id}
                        type="button"
                        variant={imageSource === src.id ? "default" : "outline"}
                        size="xs"
                        onClick={() => setImageSource(src.id)}
                        className="text-[11px] h-6 px-2 cursor-pointer font-medium"
                      >
                        {src.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Status (Draft vs Publish) */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-card">
              <div className="flex flex-col">
                <span className="text-xs font-semibold">Tujuan Penyimpanan di Blog</span>
                <span className="text-[11px] text-muted-foreground">
                  {actionStatus === "draft"
                    ? "Tersimpan di menu Draf WordPress, bisa Anda cek kembali sebelum tayang"
                    : "Langsung terbit dan bisa dibaca pengunjung web"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={actionStatus === "draft" ? "default" : "outline"}
                  size="xs"
                  onClick={() => setActionStatus("draft")}
                  disabled={isSubmitting}
                  className="cursor-pointer text-xs"
                >
                  Simpan Draf
                </Button>
                <Button
                  type="button"
                  variant={actionStatus === "publish" ? "default" : "outline"}
                  size="xs"
                  onClick={() => setActionStatus("publish")}
                  disabled={isSubmitting}
                  className="cursor-pointer text-xs"
                >
                  Langsung Terbit
                </Button>
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
                className="cursor-pointer text-xs"
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !keyword.trim() || !siteId || sites.length === 0}
                className="cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs shadow-2xs font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Sedang Menulis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    <span>Tulis &amp; Kirim Sekarang</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
