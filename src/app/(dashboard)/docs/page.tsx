"use client"

import * as React from "react"
import Link from "next/link"
import {
  BookOpen,
  FileText,
  Search,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Key,
  PenLine,
  Loader2,
  FolderOpen,
} from "lucide-react"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Input } from "@/components/atoms/input"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"

interface DocItem {
  slug: string
  filename: string
  title: string
  content: string
  updatedAt: string
}

export default function DocsPage() {
  const [docs, setDocs] = React.useState<DocItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [selectedSlug, setSelectedSlug] = React.useState<string>("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isCopied, setIsCopied] = React.useState(false)

  // Ambil daftar file markdown dari folder docs/ via API
  React.useEffect(() => {
    async function loadDocs() {
      try {
        const res = await fetch("/api/docs")
        if (res.ok) {
          const data = await res.json()
          const items: DocItem[] = data.docs || []
          setDocs(items)
          if (items.length > 0) {
            // Updater fungsional: pilih dokumen pertama hanya jika belum ada pilihan
            setSelectedSlug((current) => current || items[0].slug)
          }
        }
      } catch (err) {
        console.error("Gagal memuat dokumen:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadDocs()
  }, [])

  const filteredDocs = React.useMemo(() => {
    if (!searchQuery.trim()) return docs
    const q = searchQuery.toLowerCase()
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.filename.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q)
    )
  }, [docs, searchQuery])

  const activeDoc = React.useMemo(() => {
    return docs.find((d) => d.slug === selectedSlug) || docs[0]
  }, [docs, selectedSlug])

  const currentIndex = React.useMemo(() => {
    return docs.findIndex((d) => d.slug === activeDoc?.slug)
  }, [docs, activeDoc])

  const prevDoc = currentIndex > 0 ? docs[currentIndex - 1] : null
  const nextDoc = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null

  const handleCopyContent = () => {
    if (!activeDoc) return
    navigator.clipboard.writeText(activeDoc.content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <PageContainer size="default">
      {/* Header Halaman */}
      <PageHeader
        title="Dokumentasi &amp; Panduan"
        description="Panduan teknis penggunaan platform Panitera, konfigurasi WordPress REST API, dan manajemen agen AI."
        icon={BookOpen}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs cursor-pointer">
              <Link href="/settings/keys">
                <Key className="size-3.5 text-primary" />
                <span>Kunci API</span>
              </Link>
            </Button>
            <Button size="sm" asChild className="gap-1.5 text-xs cursor-pointer font-semibold shadow-xs">
              <Link href="/posts/new">
                <PenLine className="size-3.5" />
                <span>Tulis Artikel</span>
              </Link>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-xs">Memuat dokumen panduan...</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl p-8 bg-card">
          <FolderOpen className="size-8 text-muted-foreground/60 mb-2" />
          <span className="text-sm font-semibold text-foreground">Belum Ada Dokumen di Direktori docs/</span>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Tambahkan file panduan berformat <code>.md</code> pada folder <code>docs/</code> di root repositori untuk memuat dokumentasi secara otomatis.
          </p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 items-start">
          {/* Sidebar Daftar Dokumen (Kiri) */}
          <div className="w-full md:w-64 lg:w-72 shrink-0 flex flex-col gap-3">
            {/* Kolom Pencarian */}
            <div className="relative w-full">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari topik panduan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-xs border-border/80 bg-background"
              />
            </div>

            {/* List Menu Dokumen */}
            <div className="rounded-xl border border-border/80 bg-card p-1.5 shadow-2xs flex flex-col gap-0.5">
              <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between">
                <span>Daftar Panduan</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {filteredDocs.length} file
                </Badge>
              </div>

              {filteredDocs.map((doc) => {
                const isActive = doc.slug === activeDoc?.slug
                return (
                  <button
                    key={doc.slug}
                    type="button"
                    onClick={() => setSelectedSlug(doc.slug)}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                      isActive
                        ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <FileText className={`size-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/80"}`} />
                    <span className="truncate">{doc.title}</span>
                  </button>
                )
              })}
            </div>

            {/* Info Tips Menambah File */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground flex flex-col gap-1 leading-relaxed">
              <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                <FolderOpen className="size-3.5 text-primary" />
                Folder docs/
              </span>
              <span>
                Dokumen di halaman ini dibaca langsung dari folder <code>docs/*.md</code>. Anda cukup menambahkan atau mengedit file Markdown untuk memperbarui dokumentasi.
              </span>
            </div>
          </div>

          {/* Area Baca Konten Dokumen (Kanan) */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {activeDoc ? (
              <>
                {/* Top Bar Header Dokumen */}
                <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-border/80 bg-card shadow-2xs">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm sm:text-base font-bold text-foreground truncate">
                      {activeDoc.title}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground truncate">
                      docs/{activeDoc.filename}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyContent}
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="size-3 text-emerald-500" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        <span>Salin Markdown</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Isi Markdown Naskah Dokumen */}
                <div className="rounded-xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs">
                  <MarkdownPreview content={activeDoc.content} />
                </div>

                {/* Navigasi Sebelumnya / Selanjutnya */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  {prevDoc ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSlug(prevDoc.slug)}
                      className="text-xs gap-1.5 cursor-pointer max-w-[200px] truncate"
                    >
                      <ChevronLeft className="size-3.5 shrink-0" />
                      <span className="truncate">{prevDoc.title}</span>
                    </Button>
                  ) : (
                    <div />
                  )}

                  {nextDoc && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSlug(nextDoc.slug)}
                      className="text-xs gap-1.5 cursor-pointer max-w-[200px] truncate"
                    >
                      <span className="truncate">{nextDoc.title}</span>
                      <ChevronRight className="size-3.5 shrink-0" />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Pilih dokumen dari menu di sebelah kiri.
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  )
}
