"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  FileCode2,
  UploadCloud,
  Save,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertTriangle,
  Eye,
  FileText,
  HelpCircle,
} from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Textarea } from "@/components/atoms/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FormField } from "@/components/molecules/form-field"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"
import { Badge } from "@/components/atoms/badge"
import { cn } from "@/lib/utils"

const DEFAULT_SKILL_TEMPLATE = `---
name: Editor Konten SEO
description: Pedoman penulisan humanis, optimasi heading H2/H3, dan eliminasi slop AI.
---

# Panduan Keahlian Editor Konten SEO

Terapkan standar editorial profesional berikut pada seluruh naskah artikel yang dihasilkan:

## 1. Struktur Tematik & Heading
- Rancang struktur artikel mengalir logis tanpa penomoran kaku.
- Kembangkan setiap subbab H2/H3 dengan fakta konkret dan contoh aplikatif.

## 2. Gaya Bahasa Humanis
- Variasikan panjang kalimat secara dinamis (ritme tinggi).
- Hindari kata klise AI seperti "menyelami", "merupakan bukti", "tak terbantahkan", atau "kesimpulan".

## 3. Akurasi Faktual
- Cantumkan konteks data riil atau institusi rujukan secara wajar dan mengalir.`

function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const rawYaml = match[1]
  const result: { name?: string; description?: string } = {}

  for (const line of rawYaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let val = line.slice(colonIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key === "name") result.name = val
    if (key === "description") result.description = val
  }
  return result
}

export default function NewSkillPage() {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const initialFm = React.useMemo(() => parseSkillFrontmatter(DEFAULT_SKILL_TEMPLATE), [])
  const [name, setName] = React.useState(initialFm.name || "")
  const [slug, setSlug] = React.useState(
    initialFm.name
      ? initialFm.name
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      : ""
  )
  const [description, setDescription] = React.useState(initialFm.description || "")
  const [content, setContent] = React.useState(DEFAULT_SKILL_TEMPLATE)
  const [viewMode, setViewMode] = React.useState<"raw" | "preview">("raw")

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const handleNameChange = (val: string) => {
    setName(val)
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9_-]/g, "-")) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      )
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const fileText = event.target?.result as string
      if (fileText) {
        setContent(fileText)
        const fm = parseSkillFrontmatter(fileText)
        if (fm.name) setName(fm.name)
        if (fm.description) setDescription(fm.description)
        const baseSlug = (fm.name || file.name.replace(/\.md$/i, ""))
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
        setSlug(baseSlug)
      }
    }
    reader.readAsText(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!content.trim()) {
      setFormError("Isi dokumen SKILL.md tidak boleh kosong.")
      return
    }

    if (!name.trim()) {
      setFormError("Nama keahlian wajib diisi.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || undefined,
          content: content.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal menyimpan skill")
      }

      router.push("/skills")
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kesalahan koneksi ke server"
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Tambah Skill Baru (SKILL.md)"
          description="Daftarkan pedoman keahlian baru ke dalam Skill Registry untuk memandu riset dan penulisan Deep Agent."
          icon={FileCode2}
          actions={
            <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
              <Link href="/skills">
                <ArrowLeft className="size-3.5" />
                <span>Kembali ke Registry</span>
              </Link>
            </Button>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          {formError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Card 1: Unggah Berkas & Identitas */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <span>Identitas Keahlian</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Nama dan slug unik yang akan digunakan oleh Deep Agent runtime saat memanggil skill.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5 text-xs h-8 cursor-pointer"
                  >
                    <UploadCloud className="size-3.5 text-primary" />
                    <span>Unggah Berkas .md</span>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Nama Keahlian" required hint="Nama representatif skill, misal: Anti-AI Humanizer">
                  <Input
                    placeholder="Contoh: Editor Konten SEO"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    disabled={isSubmitting}
                    className="text-xs"
                  />
                </FormField>

                <FormField label="Slug Keahlian (ID Pemanggilan)" required hint="Karakter huruf kecil, angka, dan tanda hubung (-)">
                  <Input
                    placeholder="contoh: seo-content-editor"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    disabled={isSubmitting}
                    className="font-mono text-xs"
                  />
                </FormField>
              </div>

              <FormField label="Deskripsi Singkat" hint="Ringkasan fungsi skill ini bagi AI agent">
                <Input
                  placeholder="Contoh: Menghilangkan pola klise chatbot dan merapikan struktur heading artikel."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  className="text-xs"
                />
              </FormField>
            </CardContent>
          </Card>

          {/* Card 2: Editor Dokumen SKILL.md */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span>Naskah Dokumen SKILL.md</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Tuliskan instruksi mendalam dengan format Markdown. YAML frontmatter di atas otomatis diparsing.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("raw")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                        viewMode === "raw"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <FileCode2 className="size-3.5" />
                      <span>Raw Editor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("preview")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                        viewMode === "preview"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Eye className="size-3.5" />
                      <span>Pratinjau</span>
                    </button>
                  </div>

                  <Badge variant="outline" className="text-xs font-mono h-7 px-2">
                    {content.trim().split(/\s+/).filter(Boolean).length} Kata
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {viewMode === "raw" ? (
                <Textarea
                  rows={24}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={isSubmitting}
                  className="font-mono text-xs leading-relaxed bg-background resize-y min-h-[520px]"
                  placeholder="Tuliskan pedoman keahlian dalam format Markdown..."
                />
              ) : (
                <MarkdownPreview content={content} className="min-h-[520px]" />
              )}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded-lg border border-border/70">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="size-3.5 text-primary" />
                  <span>File ini disimpan di database Supabase dan disinkronkan ke folder <code className="font-mono text-foreground font-semibold">.workspaces/skills/{slug || "slug"}/SKILL.md</code>.</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-xs font-mono text-primary"
                  onClick={() => setContent(DEFAULT_SKILL_TEMPLATE)}
                >
                  Reset Template
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tombol Simpan Bawah */}
          <div className="flex items-center justify-between pt-2">
            <Button asChild variant="outline" size="sm" type="button" className="gap-1.5">
              <Link href="/skills">
                <ArrowLeft className="size-3.5" />
                <span>Batal</span>
              </Link>
            </Button>

            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5 font-semibold shadow-xs">
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Menyimpan ke Registry...</span>
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  <span>Simpan Skill Baru</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </PageContainer>
    </DashboardLayout>
  )
}
