"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import {
  Bot,
  BrainCircuit,
  Plus,
  Copy,
  Edit2,
  Trash2,
  Loader2,
  Sparkles,
  Wrench,
  Layers,
  AlertCircle,
} from "lucide-react"

interface AgentProfileItem {
  id?: string
  ref: string
  name: string
  description?: string
  mode: "standard" | "deep"
  modelName?: string
  temperature: number
  workflowPrompt: string
  toolIds: string[]
  isPreset: boolean
  isDefault?: boolean
}

export default function AgentProfilesPage() {
  const router = useRouter()
  const [profiles, setProfiles] = React.useState<{
    presets: AgentProfileItem[]
    userProfiles: AgentProfileItem[]
  }>({
    presets: [],
    userProfiles: [],
  })
  const [isLoading, setIsLoading] = React.useState(true)
  const [isDeletingId, setIsDeletingId] = React.useState<string | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const fetchProfiles = React.useCallback(async () => {
    try {
      const res = await fetch("/api/agents")
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login")
          return
        }
        throw new Error("Gagal mengambil data profil agen.")
      }
      const data = await res.json()
      setProfiles({
        presets: data.presets || [],
        userProfiles: data.userProfiles || [],
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kesalahan sistem"
      setErrorMessage(msg)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  React.useEffect(() => {
    let ignore = false
    async function load() {
      if (!ignore) {
        await fetchProfiles()
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [fetchProfiles])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus profil agen "${name}"?`)) return

    try {
      setIsDeletingId(id)
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Gagal menghapus profil")
      }
      await fetchProfiles()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus profil")
    } finally {
      setIsDeletingId(null)
    }
  }

  const handleClonePreset = (preset: AgentProfileItem) => {
    router.push(`/agents/new?cloneFrom=${encodeURIComponent(preset.ref)}`)
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Profil Agen AI & Orkestrasi"
          description="Rancang agen kepenulisan mandiri berbasis LangChain & Deep Agents. Pilih tools yang diizinkan dan tentukan alur logika artikel melalui prompt kustom."
          icon={Bot}
          badge={
            <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider border-primary/30 text-primary">
              Multi-Agent Runtime
            </Badge>
          }
          actions={
            <Button asChild size="sm" className="gap-1.5 shadow-xs">
              <Link href="/agents/new">
                <Plus className="size-4" />
                <span>Buat Profil Agen Baru</span>
              </Link>
            </Button>
          }
        />

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive mb-6">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Memuat katalog profil agen...</span>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Seksi 1: Profil Kustom Pengguna */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    Profil Agen Kustom Anda ({profiles.userProfiles.length})
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Agen yang Anda modifikasi dengan alur kerja, batasan komputasi, dan seleksi tools mandiri.
                  </p>
                </div>
              </div>

              {profiles.userProfiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-8 text-center">
                  <Bot className="size-8 text-muted-foreground/60 mb-2" />
                  <p className="text-xs font-semibold text-foreground">Belum Ada Profil Agen Kustom</p>
                  <p className="text-[11px] text-muted-foreground max-w-sm mt-1 leading-relaxed">
                    Anda dapat membuat profil agen baru dari awal atau mengkloning salah satu preset bawaan sistem di bawah untuk memulai.
                  </p>
                  <Button asChild size="xs" variant="outline" className="mt-4 gap-1.5">
                    <Link href="/agents/new">
                      <Plus className="size-3.5" />
                      <span>Buat Profil Pertama</span>
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {profiles.userProfiles.map((prof) => (
                    <Card key={prof.ref} className="border-border bg-card shadow-2xs hover:border-primary/40 transition-colors flex flex-col justify-between">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {prof.mode === "deep" ? (
                              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <BrainCircuit className="size-4" />
                              </div>
                            ) : (
                              <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-foreground">
                                <Bot className="size-4" />
                              </div>
                            )}
                            <div>
                              <CardTitle className="text-sm font-semibold text-foreground">
                                {prof.name}
                              </CardTitle>
                              <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider py-0 px-1 mt-0.5">
                                {prof.mode === "deep" ? "Deep Agent" : "Standard Agent"}
                              </Badge>
                            </div>
                          </div>
                          {prof.isDefault && (
                            <Badge variant="secondary" className="text-[10px] text-primary bg-primary/10 border-primary/20">
                              Default
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {prof.description || "Tidak ada deskripsi."}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="pt-0 space-y-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 mr-1">
                            <Wrench className="size-3" /> Tools ({prof.toolIds?.length || 0}):
                          </span>
                          {(prof.toolIds || []).length === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic">1-Shot tanpa tools</span>
                          ) : (
                            prof.toolIds.slice(0, 3).map((tid) => (
                              <Badge key={tid} variant="secondary" className="text-[9px] py-0 px-1.5 font-mono">
                                {tid}
                              </Badge>
                            ))
                          )}
                          {(prof.toolIds?.length || 0) > 3 && (
                            <span className="text-[9px] text-muted-foreground">
                              +{prof.toolIds.length - 3} lainnya
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-border/60 pt-3">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-xs text-muted-foreground hover:text-foreground gap-1"
                            onClick={() => router.push(`/agents/${prof.ref}`)}
                          >
                            <Edit2 className="size-3.5" />
                            <span>Edit Alur</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-xs text-destructive hover:bg-destructive/10 gap-1"
                            disabled={isDeletingId === prof.ref}
                            onClick={() => handleDelete(prof.ref, prof.name)}
                          >
                            {isDeletingId === prof.ref ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                            <span>Hapus</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Seksi 2: Preset Bawaan Sistem (Read-Only Base) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />
                    Preset Bawaan Sistem ({profiles.presets.length})
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Arsitektur rekomendasi siap pakai. Kloning preset untuk menyesuaikan alur kerja dan tools sesuai kebutuhan unik Anda.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profiles.presets.map((preset) => (
                  <Card key={preset.ref} className="border-border bg-card/60 shadow-2xs flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {preset.mode === "deep" ? (
                            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                              <BrainCircuit className="size-4" />
                            </div>
                          ) : (
                            <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-foreground">
                              <Bot className="size-4" />
                            </div>
                          )}
                          <div>
                            <CardTitle className="text-sm font-semibold text-foreground">
                              {preset.name}
                            </CardTitle>
                            <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider py-0 px-1 mt-0.5">
                              {preset.mode === "deep" ? "Deep Agent" : "Standard Agent"}
                            </Badge>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                          Preset
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {preset.description}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-0 space-y-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 mr-1">
                          <Wrench className="size-3" /> Tools ({preset.toolIds.length}):
                        </span>
                        {preset.toolIds.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground italic">1-Shot tanpa tools</span>
                        ) : (
                          preset.toolIds.map((tid) => (
                            <Badge key={tid} variant="secondary" className="text-[9px] py-0 px-1.5 font-mono">
                              {tid}
                            </Badge>
                          ))
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-border/60 pt-3">
                        <Button
                          variant="outline"
                          size="xs"
                          className="w-full text-xs gap-1.5"
                          onClick={() => handleClonePreset(preset)}
                        >
                          <Copy className="size-3" />
                          <span>Kloning & Modifikasi</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
