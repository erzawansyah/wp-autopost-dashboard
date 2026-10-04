"use client"

import * as React from "react"
import {
  FileCode2,
  UploadCloud,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
  Sparkles,
  ShieldCheck,
  FileText,
  Search,
} from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Textarea } from "@/components/atoms/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog"
import { AgentSkill } from "@/types/skills"

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

export default function SkillsPage() {
  const [skills, setSkills] = React.useState<AgentSkill[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [filterType, setFilterType] = React.useState<"all" | "system" | "custom">("all")

  // Modal Upload / Create State
  const [isUploadOpen, setIsUploadOpen] = React.useState(false)
  const [uploadName, setUploadName] = React.useState("")
  const [uploadSlug, setUploadSlug] = React.useState("")
  const [uploadDescription, setUploadDescription] = React.useState("")
  const [uploadContent, setUploadContent] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  // Modal View Content State
  const [viewingSkill, setViewingSkill] = React.useState<AgentSkill | null>(null)

  const fetchSkills = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/skills")
      if (res.ok) {
        const data = await res.json()
        setSkills(data.skills || [])
      }
    } catch (err) {
      console.error("Gagal memuat skills:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  // Handle file select (SKILL.md)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) {
        setUploadContent(text)
        const fm = parseSkillFrontmatter(text)
        if (fm.name) {
          setUploadName(fm.name)
          setUploadSlug(
            fm.name
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, "-")
              .replace(/-+/g, "-")
              .replace(/^-|-$/g, "")
          )
        }
        if (fm.description) {
          setUploadDescription(fm.description)
        }
      }
    }
    reader.readAsText(file)
  }

  const handleNameChange = (val: string) => {
    setUploadName(val)
    if (!uploadSlug || uploadSlug === uploadName.toLowerCase().replace(/[^a-z0-9_-]/g, "-")) {
      setUploadSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      )
    }
  }

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!uploadName.trim()) {
      setFormError("Nama skill wajib diisi.")
      return
    }
    if (!uploadContent.trim()) {
      setFormError("Isi file SKILL.md wajib diisi atau diunggah.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploadName.trim(),
          slug: uploadSlug.trim() || undefined,
          description: uploadDescription.trim() || undefined,
          content: uploadContent.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal menyimpan skill")
      }

      // Reset and close
      setIsUploadOpen(false)
      setUploadName("")
      setUploadSlug("")
      setUploadDescription("")
      setUploadContent("")
      fetchSkills()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan skill")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSkill = async (id: string, name: string) => {
    if (!confirm(`Hapus skill "${name}" dari registry? Tindakan ini tidak dapat dibatalkan.`)) {
      return
    }

    try {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Gagal menghapus skill")
      }
      fetchSkills()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus skill")
    }
  }

  const filteredSkills = React.useMemo(() => {
    return skills.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))

      if (!matchesSearch) return false

      if (filterType === "system") return s.is_system
      if (filterType === "custom") return !s.is_system
      return true
    })
  }, [skills, searchQuery, filterType])

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Halaman */}
        <PageHeader
          title="Skill Registry"
          description="Kelola berkas keahlian (SKILL.md) yang diinjeksikan ke LangChain Deep Agents untuk memandu riset, gaya bahasa, dan metodologi penulisan."
          icon={FileCode2}
          actions={
            <Button
              size="sm"
              onClick={() => setIsUploadOpen(true)}
              className="gap-2 text-xs font-semibold"
            >
              <UploadCloud className="size-3.5" />
              <span>Unggah SKILL.md</span>
            </Button>
          }
        />

        {/* Info Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5 text-xs">
          <div className="flex items-start gap-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0 mt-0.5">
              <Sparkles className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-foreground">
                Cara Kerja Skill pada Deep Agent
              </span>
              <span className="text-muted-foreground leading-relaxed">
                Setiap file <code>SKILL.md</code> mendefinisikan persona, panduan editorial, atau metodologi spesifik.
                Saat profil agen bertipe <strong>Deep Agent</strong> dijalankan, runtime akan memuat skill yang dicentang
                ke dalam direktori eksekusi virtual agen.
              </span>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 border-primary/30 text-primary self-start sm:self-center font-mono text-[10px]">
            createDeepAgent
          </Badge>
        </div>

        {/* Filter & Pencarian */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari nama atau slug skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-xs border-border/80 bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted border border-border/60">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filterType === "all" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Semua ({skills.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("system")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filterType === "system" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sistem ({skills.filter((s) => s.is_system).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("custom")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filterType === "custom" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Kustom Saya ({skills.filter((s) => !s.is_system).length})
            </button>
          </div>
        </div>

        {/* Grid Daftar Skill */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Memuat daftar skill...</span>
          </div>
        ) : filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-xl border border-dashed border-border/80 p-8 text-center">
            <FileCode2 className="size-8 text-muted-foreground/60" />
            <div className="flex flex-col gap-1 max-w-sm">
              <span className="text-sm font-semibold text-foreground">Tidak Ada Skill Ditemukan</span>
              <span className="text-xs text-muted-foreground">
                {searchQuery ? "Tidak ada skill yang cocok dengan kata kunci pencarian Anda." : "Belum ada skill kustom yang ditambahkan."}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => setIsUploadOpen(true)} className="text-xs gap-1.5 mt-2">
              <Plus className="size-3.5" />
              <span>Unggah File SKILL.md</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkills.map((skill) => (
              <Card key={skill.id} className="border-border/80 bg-card/90 shadow-2xs flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                        <FileCode2 className="size-3.5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-bold text-foreground truncate">
                          {skill.name}
                        </CardTitle>
                        <code className="text-[10px] text-muted-foreground font-mono">
                          {skill.slug}
                        </code>
                      </div>
                    </div>

                    {skill.is_system ? (
                      <Badge variant="outline" className="text-[10px] h-5 border-primary/40 text-primary shrink-0">
                        Sistem
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                        Kustom
                      </Badge>
                    )}
                  </div>

                  <CardDescription className="text-xs text-muted-foreground line-clamp-3 mt-2 leading-relaxed">
                    {skill.description || "Tidak ada ringkasan deskripsi."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 border-t border-border/50 pt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(skill.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewingSkill(skill)}
                      className="h-7 px-2.5 text-[11px] gap-1 border-border/80"
                    >
                      <Eye className="size-3" />
                      <span>Lihat</span>
                    </Button>

                    {!skill.is_system && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSkill(skill.id, skill.name)}
                        className="h-7 px-2 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modal Upload / Buat Skill */}
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <UploadCloud className="size-4 text-primary" />
                <span>Unggah atau Buat File SKILL.md</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Unggah file SKILL.md atau tempel isinya langsung. Metadata YAML frontmatter akan diekstrak otomatis.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveSkill} className="space-y-4 pt-2">
              {formError && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Upload File Dropzone */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  Pilih Berkas SKILL.md dari Komputer
                </Label>
                <Input
                  type="file"
                  accept=".md,.markdown"
                  onChange={handleFileChange}
                  className="text-xs h-9 cursor-pointer file:cursor-pointer file:text-xs file:font-semibold file:border-0 file:bg-primary/10 file:text-primary file:rounded-md file:px-2 file:mr-2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Nama Skill */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="skillName" className="text-xs font-semibold text-foreground">
                    Nama Skill <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="skillName"
                    placeholder="Contoh: seo-article-writer"
                    value={uploadName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Slug */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="skillSlug" className="text-xs font-semibold text-foreground">
                    Slug Direktori
                  </Label>
                  <Input
                    id="skillSlug"
                    placeholder="seo-article-writer"
                    value={uploadSlug}
                    onChange={(e) => setUploadSlug(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Deskripsi */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skillDesc" className="text-xs font-semibold text-foreground">
                  Deskripsi Ringkas
                </Label>
                <Input
                  id="skillDesc"
                  placeholder="Panduan penulisan artikel berbobot tinggi untuk..."
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              {/* Konten File SKILL.md */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skillContent" className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Isi Berkas SKILL.md <span className="text-destructive">*</span></span>
                  <span className="text-[10px] text-muted-foreground font-mono">Format Markdown murni</span>
                </Label>
                <Textarea
                  id="skillContent"
                  placeholder="---&#10;name: nama-skill&#10;description: deskripsi ringkas&#10;---&#10;&#10;# Panduan Penulisan...&#10;&#10;Instruksi detail..."
                  rows={9}
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  className="font-mono text-xs leading-relaxed resize-y"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsUploadOpen(false)}
                  disabled={isSubmitting}
                  className="text-xs"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs font-semibold gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3.5" />
                      <span>Simpan Skill</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal View Detail Konten SKILL.md */}
        <Dialog open={Boolean(viewingSkill)} onOpenChange={(open) => !open && setViewingSkill(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-bold text-foreground">
                  {viewingSkill?.name}
                </DialogTitle>
                {viewingSkill?.is_system && (
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                    Sistem
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground font-mono">
                Slug: {viewingSkill?.slug}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4 rounded-lg bg-muted/40 border border-border/70 my-2 font-mono text-xs leading-relaxed whitespace-pre-wrap select-text">
              {viewingSkill?.content}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewingSkill(null)}
                className="text-xs"
              >
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  )
}
