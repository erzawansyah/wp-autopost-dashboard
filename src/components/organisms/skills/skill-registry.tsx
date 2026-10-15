"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Eye, FileCode2, Loader2, Pencil, Plus, RotateCw, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/atoms/card"
import { EmptyState } from "@/components/molecules/empty-state"
import { SearchInput } from "@/components/molecules/search-input"
import { apiFetch } from "@/lib/api/client"
import { skillsQueries } from "@/lib/api/queries/skills"
import { queryKeys } from "@/lib/api/query-keys"
import { useConfirm } from "@/lib/ui/confirm"
import { notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import type { AgentSkillSummary } from "@/types/skills"

type SkillFilter = "all" | "system" | "custom"

const FILTERS: ReadonlyArray<{ value: SkillFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "system", label: "Sistem" },
  { value: "custom", label: "Kustom Saya" },
]

/** Zona waktu tetap (WIB) agar render server & hidrasi browser menghasilkan tanggal yang sama. */
const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
})

function matchesFilter(skill: AgentSkillSummary, filter: SkillFilter): boolean {
  if (filter === "system") return skill.is_system
  if (filter === "custom") return !skill.is_system
  return true
}

function matchesQuery(skill: AgentSkillSummary, query: string): boolean {
  if (!query) return true
  return [skill.name, skill.slug, skill.description ?? ""].some((text) => text.toLowerCase().includes(query))
}

interface SkillRegistryProps {
  /** Ringkasan skill dari page RSC (`listSkills` → `toSkillSummary`); disegarkan via `/api/skills`. */
  initialSkills: AgentSkillSummary[]
}

/** Daftar skill sistem (baca-saja) & kustom: cari, saring, buka, ubah, hapus. */
export function SkillRegistry({ initialSkills }: SkillRegistryProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<SkillFilter>("all")
  const deferredQuery = React.useDeferredValue(query.trim().toLowerCase())
  const { data: skills, error, refetch, isRefetching } = useQuery({ ...skillsQueries.list(), initialData: initialSkills })

  const counts: Record<SkillFilter, number> = {
    all: skills.length,
    system: skills.filter((skill) => skill.is_system).length,
    custom: skills.filter((skill) => !skill.is_system).length,
  }
  const visibleSkills = skills.filter((skill) => matchesFilter(skill, filter) && matchesQuery(skill, deferredQuery))

  const deleteSkill = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      notify.success("Skill dihapus dari registry.")
      return queryClient.invalidateQueries({ queryKey: queryKeys.skills.all })
    },
    onError: (err) => notify.error(err, { fallback: "Gagal menghapus skill." }),
  })

  async function handleDelete(skill: AgentSkillSummary) {
    const ok = await confirm({
      title: `Hapus skill "${skill.name}"?`,
      description: "Agent Profile yang memakai slug ini tidak lagi memuat skill tersebut. Tindakan ini tidak dapat dibatalkan.",
      confirmLabel: "Hapus",
      tone: "destructive",
    })
    if (ok) deleteSkill.mutate(skill.id)
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>Gagal memperbarui daftar skill. Data yang tampil mungkin belum terbaru.</span>
            <Button size="xs" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              <RotateCw aria-hidden="true" />
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="Cari nama, slug, atau deskripsi skill…"
          aria-label="Cari skill"
          className="max-w-sm"
        />
        <div role="group" aria-label="Saring jenis skill" className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted p-1">
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="xs"
              variant="ghost"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "text-muted-foreground",
                filter === option.value && "bg-card font-semibold text-foreground shadow-2xs hover:bg-card"
              )}
            >
              {option.label} ({counts[option.value]})
            </Button>
          ))}
        </div>
      </div>

      {visibleSkills.length === 0 ? (
        <EmptyState
          icon={FileCode2}
          title="Tidak ada skill ditemukan"
          description={deferredQuery ? "Tidak ada skill yang cocok dengan kata kunci pencarian." : "Belum ada skill pada kategori ini."}
        >
          <Button asChild size="sm">
            <Link href="/skills/new">
              <Plus aria-hidden="true" />
              Tambah Skill Baru
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          {visibleSkills.map((skill) => {
            const isDeleting = deleteSkill.isPending && deleteSkill.variables === skill.id
            return (
              <li key={skill.id} className="flex">
                <Card className="w-full justify-between gap-4 py-5 shadow-2xs">
                  <CardHeader className="gap-2 px-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <FileCode2 aria-hidden="true" className="size-3.5" />
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <CardTitle className="truncate text-sm">{skill.name}</CardTitle>
                          <code className="truncate font-mono text-2xs text-muted-foreground">{skill.slug}</code>
                        </div>
                      </div>
                      <Badge
                        variant={skill.is_system ? "outline" : "secondary"}
                        className={cn("shrink-0 text-2xs", skill.is_system && "border-primary/40 text-primary")}
                      >
                        {skill.is_system ? "Sistem" : "Kustom"}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-3 text-xs leading-relaxed">
                      {skill.description || "Tidak ada ringkasan deskripsi."}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="gap-1.5 border-t border-border/50 px-5 [.border-t]:pt-3">
                    <time dateTime={skill.created_at} className="mr-auto font-mono text-2xs text-muted-foreground">
                      {DATE_FORMAT.format(new Date(skill.created_at))}
                    </time>
                    {skill.is_system ? (
                      <Button asChild variant="outline" size="xs">
                        <Link href={`/skills/${skill.id}`} aria-label={`Lihat ${skill.name}`}>
                          <Eye aria-hidden="true" />
                          Lihat
                        </Link>
                      </Button>
                    ) : (
                      <>
                        <Button asChild variant="outline" size="xs">
                          <Link href={`/skills/${skill.id}`} aria-label={`Edit ${skill.name}`}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={isDeleting}
                          onClick={() => handleDelete(skill)}
                          aria-label={`Hapus ${skill.name}`}
                        >
                          {isDeleting ? (
                            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                          ) : (
                            <Trash2 aria-hidden="true" />
                          )}
                        </Button>
                      </>
                    )}
                  </CardFooter>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
