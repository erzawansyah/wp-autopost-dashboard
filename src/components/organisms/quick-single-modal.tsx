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
import { Sparkles, Globe, Image as ImageIcon } from "lucide-react"

interface QuickSingleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit?: (data: {
    siteId: string
    keyword: string
    category: string
    tags: string
    customBrief?: string
    actionStatus: "draft" | "publish"
    featuredImage: boolean
    imageSource: "unsplash" | "url" | "ai"
  }) => void
}

export function QuickSingleModal({
  open,
  onOpenChange,
  onSubmit,
}: QuickSingleModalProps) {
  const [siteId, setSiteId] = React.useState("site-1")
  const [keyword, setKeyword] = React.useState("")
  const [category, setCategory] = React.useState("Desain Interior")
  const [tags, setTags] = React.useState("")
  const [customBrief, setCustomBrief] = React.useState("")
  const [actionStatus, setActionStatus] = React.useState<"draft" | "publish">("draft")
  const [featuredImage, setFeaturedImage] = React.useState(true)
  const [imageSource, setImageSource] = React.useState<"unsplash" | "url" | "ai">("unsplash")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim()) return

    setIsSubmitting(true)
    setTimeout(() => {
      if (onSubmit) {
        onSubmit({
          siteId,
          keyword,
          category,
          tags,
          customBrief,
          actionStatus,
          featuredImage,
          imageSource,
        })
      }
      setIsSubmitting(false)
      onOpenChange(false)
      // Reset form
      setKeyword("")
      setCustomBrief("")
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-bold text-sm mb-1">
            <Sparkles className="size-4 text-accent" />
            <span>Modul 1: Quick Single Post</span>
          </div>
          <DialogTitle className="text-lg">Buat & Terbitkan 1 Artikel Instan</DialogTitle>
          <DialogDescription className="text-xs">
            Hasilkan konten terstruktur bebas pola klise AI langsung ke website WordPress target.
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

          {/* Keyword / Title Input */}
          <FormField
            label="Target Keyword / Judul Artikel"
            required
            hint="Contoh: Desain Dapur Minimalis Modern Ukuran 2x3"
          >
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Ketik kata kunci atau topik utama..."
              className="h-9 text-xs"
              required
            />
          </FormField>

          {/* Category & Tags Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Kategori WordPress" hint="Bisa pilih atau buat baru di WP">
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Nama kategori..."
                className="h-9 text-xs"
              />
            </FormField>
            <FormField label="Tags WP (Pisahkan Koma)" hint="Contoh: minimalis, interior">
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2..."
                className="h-9 text-xs"
              />
            </FormField>
          </div>

          {/* Custom Brief (Optional override) */}
          <FormField
            label="Instruksi Khusus (Opsional)"
            hint="Menimpa prompt template standar untuk artikel ini"
          >
            <Textarea
              value={customBrief}
              onChange={(e) => setCustomBrief(e.target.value)}
              placeholder="Fokuskan pembahasan pada anggaran ramah kantong dan material lokal..."
              rows={3}
              className="text-xs resize-none"
            />
          </FormField>

          {/* Featured Image & Source Switcher */}
          <div className="p-3 rounded-lg border border-border/70 bg-muted/20 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-primary" />
                <span className="text-xs font-semibold">Featured Image Otomatis</span>
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
                      { id: "unsplash", label: "Unsplash Stock (Gratis)" },
                      { id: "url", label: "Manual URL" },
                      { id: "ai", label: "AI Image" },
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
              <span className="text-xs font-semibold">Status Aksi WordPress</span>
              <span className="text-[11px] text-muted-foreground">
                {actionStatus === "draft"
                  ? "Disimpan sebagai draf aman untuk review manual"
                  : "Langsung diterbitkan live ke publik di website target"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={actionStatus === "draft" ? "default" : "outline"}
                size="xs"
                onClick={() => setActionStatus("draft")}
                className="cursor-pointer text-xs"
              >
                Draft
              </Button>
              <Button
                type="button"
                variant={actionStatus === "publish" ? "default" : "outline"}
                size="xs"
                onClick={() => setActionStatus("publish")}
                className="cursor-pointer text-xs"
              >
                Publish Live
              </Button>
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
              disabled={isSubmitting || !keyword.trim()}
              className="cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Sparkles className="size-3.5" />
              <span>{isSubmitting ? "Mengirim ke Queue..." : "Mulai Pembuatan Artikel"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
