"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Skeleton } from "@/components/atoms/skeleton"
import { cn } from "@/lib/utils"
import { useSanitizedHtml } from "@/lib/sanitize-html"
import {
  FileText,
  Copy,
  Check,
  Code2,
  Clock,
  Layers,
  Tag,
  Folder,
  Sparkles,
  ExternalLink,
  BookOpen,
} from "lucide-react"

interface PostDetailContentProps {
  title: string | null
  targetKeyword: string
  contentHtml: string | null
  excerpt: string | null
  categories?: string[] | null
  tags?: string[] | null
  customInstructions?: string | null
  wpPostUrl?: string | null
  className?: string
}

export function PostDetailContent({
  title,
  targetKeyword,
  contentHtml,
  excerpt,
  categories = [],
  tags = [],
  customInstructions,
  wpPostUrl,
  className,
}: PostDetailContentProps) {
  const [viewMode, setViewMode] = React.useState<"preview" | "gutenberg" | "instructions">("preview")
  const [copiedContent, setCopiedContent] = React.useState(false)
  const [copiedGutenberg, setCopiedGutenberg] = React.useState(false)
  // HTML hasil LLM wajib disanitasi; null selama SSR/hidrasi (tampilkan placeholder).
  const safeContentHtml = useSanitizedHtml(contentHtml)

  // Estimasi jumlah kata dan durasi baca
  const wordCount = React.useMemo(() => {
    if (!contentHtml) return 0
    const plainText = contentHtml.replace(/<[^>]*>/g, " ")
    return plainText.trim().split(/\s+/).filter(Boolean).length
  }, [contentHtml])

  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200))

  const handleCopyText = () => {
    if (!contentHtml) return
    const plainText = contentHtml.replace(/<[^>]*>/g, " ")
    navigator.clipboard.writeText(plainText)
    setCopiedContent(true)
    setTimeout(() => setCopiedContent(false), 2000)
  }

  const handleCopyGutenberg = () => {
    if (!contentHtml) return
    navigator.clipboard.writeText(contentHtml)
    setCopiedGutenberg(true)
    setTimeout(() => setCopiedGutenberg(false), 2000)
  }

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Kartu Ringkasan Naskah & Taksonomi */}
      <Card className="border-border/80 bg-card shadow-2xs overflow-hidden">
        <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Judul Artikel
              </span>
              <h1 className="text-lg sm:text-xl font-bold text-foreground leading-snug">
                {title || targetKeyword}
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {wpPostUrl && (
                <Button asChild size="xs" variant="default" className="gap-1.5 cursor-pointer">
                  <a href={wpPostUrl} target="_blank" rel="noopener noreferrer">
                    <span>Lihat di WordPress</span>
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Metadata Badges */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span>
                Kata Kunci: <strong className="text-foreground">{targetKeyword}</strong>
              </span>
            </div>

            {wordCount > 0 && (
              <div className="flex items-center gap-1.5 border-l border-border/60 pl-3">
                <BookOpen className="size-3.5 text-muted-foreground" />
                <span>{wordCount.toLocaleString("id-ID")} kata</span>
              </div>
            )}

            {wordCount > 0 && (
              <div className="flex items-center gap-1.5 border-l border-border/60 pl-3">
                <Clock className="size-3.5 text-muted-foreground" />
                <span>~{readingTimeMinutes} menit baca</span>
              </div>
            )}
          </div>

          {/* Kategori & Tag */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
            {categories && categories.length > 0 && (
              <div className="flex items-center gap-1.5 mr-2">
                <Folder className="size-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Kategori:</span>
                {categories.map((cat, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] font-medium">
                    {cat}
                  </Badge>
                ))}
              </div>
            )}

            {tags && tags.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="size-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Tag:</span>
                {tags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] font-mono text-muted-foreground">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Box Excerpt / Ringkasan jika ada */}
          {excerpt && (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 flex flex-col gap-1 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Ringkasan / Excerpt
              </span>
              <p className="text-foreground/90 italic leading-relaxed">{excerpt}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Konten Naskah Utama dengan Pilihan Tampilan */}
      <Card className="border-border/80 bg-card shadow-2xs overflow-hidden">
        <CardHeader className="py-3 px-4 border-b border-border/60 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-background p-1 rounded-lg border border-border/80">
              <Button
                size="xs"
                variant={viewMode === "preview" ? "default" : "ghost"}
                onClick={() => setViewMode("preview")}
                className="gap-1.5 text-xs h-7 cursor-pointer"
              >
                <FileText className="size-3.5" />
                <span>Baca Naskah</span>
              </Button>
              <Button
                size="xs"
                variant={viewMode === "gutenberg" ? "default" : "ghost"}
                onClick={() => setViewMode("gutenberg")}
                className="gap-1.5 text-xs h-7 cursor-pointer"
              >
                <Code2 className="size-3.5" />
                <span>Kode Gutenberg</span>
              </Button>
              {customInstructions && (
                <Button
                  size="xs"
                  variant={viewMode === "instructions" ? "default" : "ghost"}
                  onClick={() => setViewMode("instructions")}
                  className="gap-1.5 text-xs h-7 cursor-pointer"
                >
                  <Sparkles className="size-3.5" />
                  <span>Instruksi Khusus</span>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {viewMode === "preview" && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleCopyText}
                  className="gap-1.5 text-xs h-7 cursor-pointer"
                >
                  {copiedContent ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  <span>{copiedContent ? "Tersalin" : "Salin Teks"}</span>
                </Button>
              )}
              {viewMode === "gutenberg" && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleCopyGutenberg}
                  className="gap-1.5 text-xs h-7 cursor-pointer"
                >
                  {copiedGutenberg ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  <span>{copiedGutenberg ? "Tersalin" : "Salin Kode"}</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {!contentHtml ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground text-xs gap-2">
              <FileText className="size-8 text-primary animate-pulse" />
              <span className="font-semibold text-foreground">Naskah sedang ditulis...</span>
              <p className="text-[11px] max-w-sm">
                Artikel lengkap akan tampil otomatis di sini begitu proses penulisan selesai.
              </p>
            </div>
          ) : viewMode === "preview" ? (
            safeContentHtml === null ? (
              <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Menyiapkan pratinjau naskah">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : (
              <div
                className="prose prose-neutral dark:prose-invert max-w-none text-foreground text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: safeContentHtml }}
              />
            )
          ) : viewMode === "gutenberg" ? (
            <pre className="max-h-[600px] overflow-auto rounded-lg bg-muted/60 p-4 font-mono text-[11px] leading-relaxed text-foreground border border-border select-all whitespace-pre-wrap">
              {contentHtml}
            </pre>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">Instruksi Khusus / Custom Brief:</span>
              <pre className="rounded-lg bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground border border-border/70 whitespace-pre-wrap">
                {customInstructions}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
