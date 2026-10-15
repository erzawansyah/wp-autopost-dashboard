"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Bot, Copy, Layers, Loader2, Pencil, Plus, RotateCw, Sparkles, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"
import { AgentProfileCard } from "@/components/organisms/agents/agent-profile-card"
import { apiFetch } from "@/lib/api/client"
import { agentsQueries } from "@/lib/api/queries/agents"
import { queryKeys } from "@/lib/api/query-keys"
import { useConfirm } from "@/lib/ui/confirm"
import { notify } from "@/lib/ui/notify"
import type { AgentProfileCatalog as Catalog, AgentProfileSummary } from "@/types/agents"

interface AgentProfileCatalogProps {
  /** Daftar awal dari page RSC (`listAgentProfiles` → ringkasan); disegarkan via `/api/agents`. */
  initialCatalog: Catalog
}

interface SectionHeadingProps {
  id: string
  icon: typeof Bot
  title: string
  description: string
}

function SectionHeading({ id, icon: Icon, title, description }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 pb-2">
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        {title}
      </h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

/** Daftar Agent Profile kustom (edit/arsipkan) + preset bawaan (baca-saja, hanya kloning). */
export function AgentProfileCatalog({ initialCatalog }: AgentProfileCatalogProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data: catalog, error, refetch, isRefetching } = useQuery({
    ...agentsQueries.list(),
    initialData: initialCatalog,
  })

  const archiveProfile = useMutation({
    mutationFn: (ref: string) =>
      apiFetch<{ message: string }>(`/api/agents/${encodeURIComponent(ref)}`, { method: "DELETE" }),
    onSuccess: ({ message }) => {
      notify.success(message || "Profil agen berhasil diarsipkan.")
      // Daftar Agent Profile juga tampil di registry Laboratorium (dimuat ulang dari server saat dibuka).
      queryClient.removeQueries({ queryKey: queryKeys.lab.all })
      return queryClient.invalidateQueries({ queryKey: queryKeys.agents.all })
    },
    onError: (err) => notify.error(err, { fallback: "Gagal menghapus profil agen." }),
  })

  async function handleArchive(profile: AgentProfileSummary) {
    const ok = await confirm({
      title: `Hapus profil agen "${profile.name}"?`,
      description: "Profil diarsipkan: tidak muncul lagi di pilihan, tetapi antrean lama yang memakainya tetap dapat diproses.",
      confirmLabel: "Hapus",
      tone: "destructive",
    })
    if (ok) archiveProfile.mutate(profile.ref)
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>Gagal memperbarui daftar profil agen. Data yang tampil mungkin belum terbaru.</span>
            <Button size="xs" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RotateCw aria-hidden="true" className={isRefetching ? "animate-spin motion-reduce:animate-none" : undefined} />
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="custom-profiles" className="flex flex-col gap-4">
        <SectionHeading
          id="custom-profiles"
          icon={Sparkles}
          title={`Agent Profile Kustom Anda (${catalog.userProfiles.length})`}
          description="Profil yang Anda rancang sendiri: alur kerja, batas komputasi, dan pilihan tools."
        />
        {catalog.userProfiles.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Belum ada Agent Profile kustom"
            description="Buat profil baru dari awal atau kloning salah satu preset bawaan di bawah untuk memulai."
          >
            <Button asChild size="sm" variant="outline">
              <Link href="/agents/new">
                <Plus aria-hidden="true" />
                Buat Profil Pertama
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {catalog.userProfiles.map((profile) => {
              const isArchiving = archiveProfile.isPending && archiveProfile.variables === profile.ref
              return (
                <li key={profile.ref} className="flex">
                  <AgentProfileCard profile={profile}>
                    <Button asChild variant="ghost" size="xs" className="text-muted-foreground hover:text-foreground">
                      <Link href={`/agents/${profile.ref}`} aria-label={`Edit ${profile.name}`}>
                        <Pencil aria-hidden="true" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={isArchiving}
                      onClick={() => handleArchive(profile)}
                      aria-label={`Hapus ${profile.name}`}
                    >
                      {isArchiving ? (
                        <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                      ) : (
                        <Trash2 aria-hidden="true" />
                      )}
                      Hapus
                    </Button>
                  </AgentProfileCard>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="preset-profiles" className="flex flex-col gap-4">
        <SectionHeading
          id="preset-profiles"
          icon={Layers}
          title={`Preset Bawaan Sistem (${catalog.presets.length})`}
          description="Profil rekomendasi siap pakai dan baca-saja. Kloning untuk menyesuaikan alur kerja dan tools."
        />
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {catalog.presets.map((preset) => (
            <li key={preset.ref} className="flex">
              <AgentProfileCard profile={preset}>
                <Button asChild variant="outline" size="xs" className="w-full">
                  <Link href={`/agents/new?cloneFrom=${encodeURIComponent(preset.ref)}`} aria-label={`Kloning ${preset.name}`}>
                    <Copy aria-hidden="true" />
                    Kloning &amp; Modifikasi
                  </Link>
                </Button>
              </AgentProfileCard>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
