"use client"

import * as React from "react"
import { BookOpen, Check, Clock, Code2, Copy, ExternalLink, FileText, Folder, Sparkles, Tag } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardHeader } from "@/components/atoms/card"
import { Skeleton } from "@/components/atoms/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { useSanitizedHtml } from "@/lib/sanitize-html"
import { notify } from "@/lib/ui/notify"
import type { PostDetail } from "@/types/posts"

type ViewMode = "preview" | "gutenberg" | "instructions"

/** Teks polos dari markup Gutenberg (untuk hitung kata & salin teks). */
function toPlainText(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function useCopyFeedback() {
  const [copied, setCopied] = React.useState<string | null>(null)
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000)
    } catch {
      notify.error("Gagal menyalin ke clipboard.")
    }
  }
  return { copied, copy }
}

/**
 * Naskah artikel: ringkasan & taksonomi, pratinjau HTML (WAJIB lewat `useSanitizedHtml` — DOMPurify,
 * null saat SSR/hidrasi), kode Gutenberg mentah (di-escape React), dan instruksi khusus.
 */
export function PostDetailContent({
  post,
}: {
  post: Pick<PostDetail, "title" | "target_keyword" | "content_html" | "excerpt" | "categories" | "tags" | "custom_instructions_override" | "wp_post_url">
}) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("preview")
  const { copied, copy } = useCopyFeedback()
  const contentHtml = post.content_html
  const safeContentHtml = useSanitizedHtml(contentHtml)
  const plainText = React.useMemo(() => (contentHtml ? toPlainText(contentHtml) : ""), [contentHtml])
  const wordCount = plainText ? plainText.split(" ").length : 0
  const readingMinutes = Math.max(1, Math.round(wordCount / 200))
  const categories = post.categories ?? []
  const tags = post.tags ?? []

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden border-border/80 shadow-2xs">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Judul artikel</span>
              <h2 className="text-lg leading-snug font-bold text-foreground sm:text-xl">{post.title || post.target_keyword}</h2>
            </div>
            {post.wp_post_url && (
              <Button asChild size="xs" className="shrink-0 gap-1.5">
                <a href={post.wp_post_url} target="_blank" rel="noopener noreferrer">
                  Lihat di WordPress
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Kata kunci: <strong className="text-foreground">{post.target_keyword}</strong>
            </span>
            {wordCount > 0 && (
              <>
                <span className="flex items-center gap-1.5 border-l border-border/60 pl-3">
                  <BookOpen aria-hidden="true" className="size-3.5" />
                  {wordCount.toLocaleString("id-ID")} kata
                </span>
                <span className="flex items-center gap-1.5 border-l border-border/60 pl-3">
                  <Clock aria-hidden="true" className="size-3.5" />~{readingMinutes} menit baca
                </span>
              </>
            )}
          </div>

          {(categories.length > 0 || tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
              {categories.length > 0 && (
                <div className="mr-2 flex flex-wrap items-center gap-1.5">
                  <Folder aria-hidden="true" className="size-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Kategori:</span>
                  {categories.map((category) => (
                    <Badge key={category} variant="secondary" className="text-xs font-medium">
                      {category}
                    </Badge>
                  ))}
                </div>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag aria-hidden="true" className="size-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tag:</span>
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="font-mono text-xs text-muted-foreground">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {post.excerpt && (
            <div className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
              <span className="font-mono text-2xs font-bold tracking-wider text-muted-foreground uppercase">Ringkasan / excerpt</span>
              <p className="leading-relaxed text-foreground/90 italic">{post.excerpt}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 shadow-2xs">
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
          <CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-3">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <TabsList>
                <TabsTrigger value="preview" className="gap-1.5 text-xs">
                  <FileText aria-hidden="true" className="size-3.5" />
                  Baca naskah
                </TabsTrigger>
                <TabsTrigger value="gutenberg" className="gap-1.5 text-xs">
                  <Code2 aria-hidden="true" className="size-3.5" />
                  Kode Gutenberg
                </TabsTrigger>
                {post.custom_instructions_override && (
                  <TabsTrigger value="instructions" className="gap-1.5 text-xs">
                    <Sparkles aria-hidden="true" className="size-3.5" />
                    Instruksi khusus
                  </TabsTrigger>
                )}
              </TabsList>
              {contentHtml && viewMode !== "instructions" && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void copy(viewMode, viewMode === "preview" ? plainText : contentHtml)}
                  className="gap-1.5 self-start sm:self-auto"
                >
                  {copied === viewMode ? (
                    <Check aria-hidden="true" className="size-3 text-success-strong" />
                  ) : (
                    <Copy aria-hidden="true" className="size-3" />
                  )}
                  {copied === viewMode ? "Tersalin" : viewMode === "preview" ? "Salin teks" : "Salin kode"}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-5">
            {!contentHtml ? (
              <div role="status" className="flex flex-col items-center justify-center gap-2 p-12 text-center text-xs text-muted-foreground">
                <FileText aria-hidden="true" className="size-8 animate-pulse text-primary motion-reduce:animate-none" />
                <span className="font-semibold text-foreground">Naskah sedang ditulis…</span>
                <p className="max-w-sm">Artikel lengkap tampil otomatis di sini begitu proses penulisan selesai.</p>
              </div>
            ) : (
              <>
                <TabsContent value="preview" className="mt-0">
                  {safeContentHtml === null ? (
                    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Menyiapkan pratinjau naskah">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                    </div>
                  ) : (
                    <div
                      className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed text-foreground"
                      dangerouslySetInnerHTML={{ __html: safeContentHtml }}
                    />
                  )}
                </TabsContent>
                <TabsContent value="gutenberg" className="mt-0">
                  <pre className="max-h-150 overflow-auto rounded-lg border border-border bg-muted/60 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground select-all">
                    {contentHtml}
                  </pre>
                </TabsContent>
              </>
            )}
            {post.custom_instructions_override && (
              <TabsContent value="instructions" className="mt-0 flex flex-col gap-2">
                <span className="text-xs font-semibold text-foreground">Instruksi khusus / custom brief:</span>
                <pre className="rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                  {post.custom_instructions_override}
                </pre>
              </TabsContent>
            )}
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}
