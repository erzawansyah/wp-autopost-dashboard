"use client"

import * as React from "react"
import {
  Users,
  UserPlus,
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Search,
  Check,
  X,
  Award,
  Info,
  ChevronDown,
  ChevronUp,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/atoms/tabs"
import type { WPUserItem } from "@/lib/wordpress/client"

interface SiteItem {
  id: string
  site_name: string
  base_url: string
}

interface AIAuthorSuggestion {
  name: string
  username: string
  email: string
  role: "author" | "editor" | "contributor"
  bio: string
  expertise: string
  rationale: string
  status?: "idle" | "creating" | "created" | "rejected" | "error"
  createdUserId?: number
  errorMessage?: string
}

const PRESET_AUTHOR_PROMPTS = [
  "Master Barista & Roaster Kopi Spesialis Single Origin Nusantara",
  "Analis Finansial & Edukator Manajemen Keuangan Keluarga",
  "Reviewer Teknologi, Gadget, & Praktisi AI Terapan",
  "Dokter / Praktisi Kesehatan Holistik & Nutrisi Medis",
]

export default function AuthorsToolPage() {
  const [sites, setSites] = React.useState<SiteItem[]>([])
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>("")
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)

  const [authors, setAuthors] = React.useState<WPUserItem[]>([])
  const [isLoadingAuthors, setIsLoadingAuthors] = React.useState(false)
  const [searchFilter, setSearchFilter] = React.useState("")
  const [expandedBios, setExpandedBios] = React.useState<Record<number, boolean>>({})

  // AI Persona Assistant State
  const [aiPrompt, setAiPrompt] = React.useState("")
  const [isGeneratingAi, setIsGeneratingAi] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<AIAuthorSuggestion[]>([])

  // Form Manual State
  const [username, setUsername] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState("author")
  const [bio, setBio] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  // Load sites
  React.useEffect(() => {
    async function loadSites() {
      setIsLoadingSites(true)
      try {
        const res = await fetch("/api/sites")
        const data = await res.json()
        if (res.ok && Array.isArray(data.sites)) {
          const list = data.sites
            .filter((s: { status?: string }) => s.status === "connected")
            .map((s: { id: string; site_name: string; base_url: string }) => ({
              id: s.id,
              site_name: s.site_name,
              base_url: s.base_url,
            }))
          setSites(list)
          if (list.length > 0) {
            setSelectedSiteId(list[0].id)
          }
        }
      } catch (err) {
        console.error("Gagal memuat situs:", err)
      } finally {
        setIsLoadingSites(false)
      }
    }
    loadSites()
  }, [])

  // Load authors from WordPress
  const loadAuthors = React.useCallback(async (siteId: string) => {
    if (!siteId) return
    setIsLoadingAuthors(true)
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/authors`)
      const data = await res.json()
      if (res.ok) {
        setAuthors(data.users || [])
      } else {
        setStatusMessage({ type: "error", text: data.error || "Gagal memuat daftar author dari WordPress." })
      }
    } catch {
      setStatusMessage({ type: "error", text: "Terjadi gangguan saat mengambil data author." })
    } finally {
      setIsLoadingAuthors(false)
    }
  }, [])

  React.useEffect(() => {
    let ignore = false
    async function load() {
      if (selectedSiteId && !ignore) {
        await loadAuthors(selectedSiteId)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [selectedSiteId, loadAuthors])

  // AI Suggestion Handler
  const handleGenerateAiPersonas = async (promptOverride?: string) => {
    const textPrompt = (promptOverride || aiPrompt).trim()
    if (!textPrompt || !selectedSiteId) return

    setIsGeneratingAi(true)
    setStatusMessage(null)

    try {
      const res = await fetch("/api/tools/authors/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSiteId,
          prompt: textPrompt,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal merancang persona penulis dengan AI.")
      }

      const incoming = (data.suggestions || []).map((s: AIAuthorSuggestion) => ({
        ...s,
        status: "idle",
      }))
      setSuggestions(incoming)

      setStatusMessage({
        type: "success",
        text: `AI berhasil merancang ${incoming.length} persona penulis baru dengan standar E-E-A-T. Silakan tinjau dan klik "Setujui" untuk menerbitkan ke WordPress.`,
      })
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Terjadi kesalahan saat memanggil asisten AI.",
      })
    } finally {
      setIsGeneratingAi(false)
    }
  }

  // Approve & Create author in WordPress
  const handleApproveSuggestion = async (index: number) => {
    if (!selectedSiteId) return
    const candidate = suggestions[index]
    if (!candidate || candidate.status === "created") return

    // Update status to creating
    setSuggestions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, status: "creating" } : item))
    )
    setStatusMessage(null)

    try {
      const res = await fetch(`/api/sites/${selectedSiteId}/authors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: candidate.username.trim(),
          name: candidate.name.trim(),
          email: candidate.email.trim(),
          roles: [candidate.role || "author"],
          description: candidate.bio.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat author di WordPress")
      }

      const newId = data.user?.id

      setSuggestions((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? { ...item, status: "created", createdUserId: newId }
            : item
        )
      )

      setStatusMessage({
        type: "success",
        text: `Persona "${candidate.name}" (@${candidate.username}) berhasil disetujui dan dibuat di WordPress!`,
      })

      loadAuthors(selectedSiteId)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Gagal membuat author"
      setSuggestions((prev) =>
        prev.map((item, idx) =>
          idx === index ? { ...item, status: "error", errorMessage: errMsg } : item
        )
      )
      setStatusMessage({
        type: "error",
        text: `Gagal membuat "${candidate.name}": ${errMsg}`,
      })
    }
  }

  // Reject / Dismiss suggestion
  const handleRejectSuggestion = (index: number) => {
    setSuggestions((prev) => prev.filter((_, idx) => idx !== index))
  }

  // Handle manual submit
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !displayName.trim() || !email.trim() || !selectedSiteId) return

    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/sites/${selectedSiteId}/authors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          name: displayName.trim(),
          email: email.trim(),
          roles: [role],
          description: bio.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat author di WordPress")
      }

      setStatusMessage({
        type: "success",
        text: `Author "${displayName}" (@${username}) berhasil ditambahkan ke WordPress!`,
      })
      setUsername("")
      setDisplayName("")
      setEmail("")
      setBio("")
      loadAuthors(selectedSiteId)
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal membuat author",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Quick bio generator helper for manual mode
  const handleGeneratePresetBio = (niche: string) => {
    const bios: Record<string, string> = {
      tech: "Praktisi teknologi informasi dan software enthusiast dengan pengalaman 7+ tahun mengulas gawai, sistem cloud, dan perkembangan AI terkini.",
      finance: "Analis keuangan independen dan edukator literasi finansial. Berfokus menyajikan strategi investasi cerdas, tabungan, dan manajemen risiko bagi pemula.",
      culinary: "Pencinta kuliner nusantara dan koki rumahan yang gemar mendokumentasikan resep autentik serta rahasia dapur warisan keluarga.",
      health: "Pemerhati gaya hidup sehat dan kebugaran holistik. Berkomitmen menghadirkan tips nutrisi dan kesehatan preventif berbasis bukti ilmiah.",
    }
    setBio(bios[niche] || `Penulis konten profesional berdedikasi tinggi dalam menyajikan artikel informatif, faktual, dan mendalam.`)
  }

  // Filtered authors on the right
  const filteredAuthors = React.useMemo(() => {
    if (!searchFilter.trim()) return authors
    const q = searchFilter.toLowerCase()
    return authors.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.slug.toLowerCase().includes(q) ||
        (u.description && u.description.toLowerCase().includes(q))
    )
  }, [authors, searchFilter])

  const toggleBioExpand = (id: number) => {
    setExpandedBios((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Halaman */}
        <PageHeader
          title="Author Creator"
          description="Rancang dan kelola profil persona penulis (Author E-E-A-T) langsung ke database WordPress target."
          icon={Users}
          backHref="/tools"
          backLabel="Kembali ke WP Tools"
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={selectedSiteId}
                onValueChange={setSelectedSiteId}
                disabled={isLoadingSites || sites.length === 0}
              >
                <SelectTrigger className="h-8 w-[190px] sm:w-[230px] text-xs border-border/80 bg-background">
                  <Globe className="mr-1.5 size-3.5 text-primary shrink-0" />
                  <SelectValue placeholder={isLoadingSites ? "Memuat situs..." : "Pilih Website..."} />
                </SelectTrigger>
                <SelectContent align="end">
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      <span className="font-medium">{s.site_name}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground truncate">
                        ({s.base_url.replace(/^https?:\/\//, "")})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadAuthors(selectedSiteId)}
                disabled={isLoadingAuthors || !selectedSiteId}
                className="h-8 gap-1.5 px-2.5 text-xs shrink-0"
                title="Segarkan Author"
              >
                <RefreshCw className={`size-3.5 ${isLoadingAuthors ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Segarkan</span>
              </Button>
            </div>
          }
        />

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`flex items-start gap-2.5 p-3.5 rounded-lg border text-xs ${
              statusMessage.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sisi Kiri: AI Persona Assistant & Manual */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <Tabs defaultValue="ai" className="w-full">
              <div className="flex items-center justify-between mb-3">
                <TabsList className="h-9 p-1 bg-muted">
                  <TabsTrigger value="ai" className="text-xs font-semibold gap-1.5 cursor-pointer">
                    <Sparkles className="size-3.5 text-primary" />
                    <span>Asisten AI Persona (Rekomendasi)</span>
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="text-xs font-medium cursor-pointer">
                    <span>Tambah Manual</span>
                  </TabsTrigger>
                </TabsList>
                <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground">
                  {authors.length} Author di WP
                </Badge>
              </div>

              {/* TAB 1: ASISTEN AI PERSONA */}
              <TabsContent value="ai" className="mt-0 space-y-4">
                <Card className="border-border/80 bg-card shadow-2xs">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span>Rancang Persona Penulis dengan AI</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      AI akan membaca author & bio yang sudah ada di WordPress Anda, lalu merancang profil author baru
                      dengan suara unik, kredensial nyata, dan bio standar E-E-A-T.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aiAuthorPrompt" className="text-xs font-semibold text-foreground">
                        Instruksi / Arahan Profil Penulis
                      </Label>
                      <Textarea
                        id="aiAuthorPrompt"
                        placeholder="Contoh: Rancang 2 persona: satu master barista senior dengan 10 tahun pengalaman spesialis manual brew, dan satu roaster kopi muda..."
                        rows={3}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="text-xs resize-y"
                      />
                    </div>

                    {/* Preset Chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-1">
                        <Info className="size-3" /> Contoh Ide:
                      </span>
                      {PRESET_AUTHOR_PROMPTS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setAiPrompt(preset)
                            handleGenerateAiPersonas(preset)
                          }}
                          className="text-[10px] bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md border border-border/60 transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleGenerateAiPersonas()}
                      disabled={isGeneratingAi || !aiPrompt.trim() || !selectedSiteId}
                      className="w-full text-xs font-semibold gap-1.5"
                    >
                      {isGeneratingAi ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>AI Sedang Memeriksa WordPress & Merancang Persona...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          <span>Rancang Persona dengan AI</span>
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Candidate Suggestions */}
                {suggestions.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Award className="size-4 text-primary" />
                        Kandidat Persona Baru ({suggestions.length})
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Tinjau profil & klik Setujui untuk membuat di WordPress
                      </span>
                    </div>

                    {suggestions.map((candidate, idx) => (
                      <Card
                        key={idx}
                        className={`border-border/80 bg-card shadow-2xs transition-all ${
                          candidate.status === "created"
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : ""
                        }`}
                      >
                        <CardHeader className="pb-3 border-b border-border/60">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 rounded-full bg-primary/10 text-primary items-center justify-center font-bold text-sm shrink-0">
                                {candidate.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground text-sm">{candidate.name}</span>
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    @{candidate.username}
                                  </span>
                                </div>
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  {candidate.email}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {candidate.role}
                              </Badge>
                              {candidate.status === "created" && (
                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
                                  <Check className="size-3" /> Dibuat #{candidate.createdUserId}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="pt-3.5 space-y-3">
                          {/* Bidang Keahlian */}
                          {candidate.expertise && (
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className="text-[10px] font-semibold text-foreground mr-1">
                                Keahlian:
                              </span>
                              {candidate.expertise.split(",").map((exp, eIdx) => (
                                <Badge
                                  key={eIdx}
                                  variant="secondary"
                                  className="text-[10px] font-normal px-2 py-0"
                                >
                                  {exp.trim()}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Bio */}
                          <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-xs">
                            <span className="font-semibold text-foreground block mb-1">
                              Biografi Profil (E-E-A-T Bio):
                            </span>
                            <p className="text-muted-foreground leading-relaxed text-[11px]">
                              {candidate.bio}
                            </p>
                          </div>

                          {/* Rationale */}
                          {candidate.rationale && (
                            <div className="text-[10px] text-muted-foreground/80 flex items-start gap-1.5">
                              <Info className="size-3.5 text-primary shrink-0 mt-0.5" />
                              <span>
                                <strong className="text-foreground">Alasan Kredibilitas:</strong>{" "}
                                {candidate.rationale}
                              </span>
                            </div>
                          )}

                          {/* Error if any */}
                          {candidate.status === "error" && (
                            <div className="p-2 rounded bg-destructive/10 text-destructive text-[11px] flex items-center gap-1.5">
                              <AlertCircle className="size-3.5 shrink-0" />
                              <span>{candidate.errorMessage || "Gagal membuat author di WordPress"}</span>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border/40">
                            {candidate.status !== "created" ? (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRejectSuggestion(idx)}
                                  disabled={candidate.status === "creating"}
                                  className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1 px-2.5"
                                >
                                  <X className="size-3.5" />
                                  <span>Tolak</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleApproveSuggestion(idx)}
                                  disabled={candidate.status === "creating"}
                                  className="h-8 text-xs font-semibold gap-1.5 px-3"
                                >
                                  {candidate.status === "creating" ? (
                                    <>
                                      <Loader2 className="size-3.5 animate-spin" />
                                      <span>Mendaftarkan ke WP...</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserPlus className="size-3.5" />
                                      <span>Setujui & Buat di WordPress</span>
                                    </>
                                  )}
                                </Button>
                              </>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="size-4" />
                                <span>Telah aktif di WordPress sebagai author resmi.</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: MANUAL MODE */}
              <TabsContent value="manual" className="mt-0">
                <Card className="border-border/80 bg-card shadow-2xs">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <UserPlus className="size-4 text-primary" />
                      <span>Tambah Author Manual</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Daftarkan author baru langsung ke database WordPress via WP REST API.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <form onSubmit={handleManualSubmit} className="space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="uUsername" className="text-xs font-semibold text-foreground">
                            Username <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="uUsername"
                            placeholder="john_writer"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="h-9 text-xs font-mono"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="uRole" className="text-xs font-semibold text-foreground">
                            Peran (Role)
                          </Label>
                          <Select value={role} onValueChange={setRole}>
                            <SelectTrigger id="uRole" className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="author" className="text-xs">Author (Penulis)</SelectItem>
                              <SelectItem value="editor" className="text-xs">Editor</SelectItem>
                              <SelectItem value="contributor" className="text-xs">Contributor</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="uName" className="text-xs font-semibold text-foreground">
                          Nama Tampilan (Display Name) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="uName"
                          placeholder="John Doe, S.Kom."
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="uEmail" className="text-xs font-semibold text-foreground">
                          Alamat Email <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="uEmail"
                          type="email"
                          placeholder="john@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>

                      {/* Bio Generator Helper */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="uBio" className="text-xs font-semibold text-foreground">
                            Biografi Penulis (E-E-A-T Bio)
                          </Label>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground mr-1">Preset:</span>
                            <button
                              type="button"
                              onClick={() => handleGeneratePresetBio("tech")}
                              className="text-[10px] text-primary hover:underline"
                            >
                              Tekno
                            </button>
                            <span className="text-muted-foreground">&bull;</span>
                            <button
                              type="button"
                              onClick={() => handleGeneratePresetBio("finance")}
                              className="text-[10px] text-primary hover:underline"
                            >
                              Finansial
                            </button>
                            <span className="text-muted-foreground">&bull;</span>
                            <button
                              type="button"
                              onClick={() => handleGeneratePresetBio("culinary")}
                              className="text-[10px] text-primary hover:underline"
                            >
                              Kuliner
                            </button>
                          </div>
                        </div>
                        <Textarea
                          id="uBio"
                          placeholder="Biografi singkat yang mencantumkan keahlian, pengalaman, dan latar belakang penulis..."
                          rows={3}
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          className="text-xs resize-y"
                        />
                      </div>

                      <Button
                        type="submit"
                        size="sm"
                        disabled={isSubmitting || !username.trim() || !displayName.trim() || !email.trim() || !selectedSiteId}
                        className="w-full text-xs font-semibold gap-1.5 mt-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            <span>Mendaftarkan ke WordPress...</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="size-3.5" />
                            <span>Buat Author di WordPress</span>
                          </>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sisi Kanan: Daftar Author & Bio di WordPress */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Users className="size-4 text-primary" />
                      <span>Author & Bio di WordPress</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Daftar profil pengguna aktif yang terdaftar di WordPress.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {authors.length} Author
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {/* Search / Filter bar */}
                <div className="p-2.5 border-b border-border/60 bg-muted/20">
                  <div className="relative">
                    <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama, username, atau keahlian bio..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="h-8 pl-8 text-xs bg-background"
                    />
                  </div>
                </div>

                {isLoadingAuthors ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <span className="text-xs">Mengambil data author dari WordPress...</span>
                  </div>
                ) : authors.length === 0 ? (
                  <div className="text-center py-16 text-xs text-muted-foreground">
                    Belum ada author yang ditemukan atau hak akses REST API pengguna dibatasi.
                  </div>
                ) : filteredAuthors.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground">
                    Tidak ada author yang cocok dengan &quot;{searchFilter}&quot;.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[520px] overflow-y-auto">
                    {filteredAuthors.map((u) => {
                      const isExpanded = !!expandedBios[u.id]
                      const hasBio = Boolean(u.description && u.description.trim().length > 0)

                      return (
                        <div
                          key={u.id}
                          className="p-3.5 hover:bg-muted/30 transition-colors text-xs flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex size-7 rounded-full bg-primary/10 text-primary items-center justify-center font-bold text-xs shrink-0">
                                {u.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-foreground truncate">{u.name}</span>
                                <span className="font-mono text-[10px] text-muted-foreground truncate">
                                  @{u.slug}
                                </span>
                              </div>
                            </div>

                            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                              ID: #{u.id}
                            </span>
                          </div>

                          {/* Bio Snippet / Full */}
                          {hasBio ? (
                            <div className="bg-muted/30 p-2 rounded text-[11px] text-muted-foreground leading-relaxed border border-border/40">
                              <p className={isExpanded ? "" : "line-clamp-2"}>
                                {u.description}
                              </p>
                              {u.description && u.description.length > 100 && (
                                <button
                                  type="button"
                                  onClick={() => toggleBioExpand(u.id)}
                                  className="text-[10px] text-primary hover:underline font-medium mt-1 flex items-center gap-0.5"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="size-3" /> Ringkas
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="size-3" /> Selengkapnya
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/60 italic">
                              Belum ada profil biografi di WordPress.
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
