"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Info, Users } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { CardContent, CardHeader } from "@/components/atoms/card"
import { EmptyState } from "@/components/molecules/empty-state"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { notify } from "@/lib/ui/notify"
import { AuthorSuggestFormSchema, type WpToolPromptInput } from "@/lib/validation/tools"
import type { SiteAuthor } from "@/types/site"
import type { AuthorSuggestion, AuthorSuggestResponse } from "@/types/tools"
import { AuthorInitial } from "./author-initial"
import { SuggestionItem, SuggestionList } from "./suggestion-list"
import { splitExpertise } from "./tool-helpers"
import { ToolPromptForm } from "./tool-prompt-form"
import { ToolRunFeedback } from "./tool-run-feedback"
import { useSuggestionReview } from "./use-suggestion-review"
import { useToolRun } from "./use-tool-run"

const PRESET_PROMPTS = [
  "Master Barista & Roaster Kopi Spesialis Single Origin Nusantara",
  "Analis Finansial & Edukator Manajemen Keuangan Keluarga",
  "Reviewer Teknologi, Gadget, & Praktisi AI Terapan",
  "Dokter / Praktisi Kesehatan Holistik & Nutrisi Medis",
] as const

/** Asisten AI Author Creator: instruksi → persona E-E-A-T → setujui per persona → user dibuat di WordPress. */
export function AuthorAiPanel({ siteId }: { siteId: string }) {
  const run = useToolRun<WpToolPromptInput, AuthorSuggestResponse>("/api/tools/authors/suggest", siteId)

  function handleRun(prompt: string) {
    run.run(
      { siteId, prompt },
      {
        onSuccess: ({ suggestions }) => {
          if (suggestions.length > 0) notify.success(`AI merancang ${suggestions.length} persona penulis baru.`)
        },
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolPromptForm
        schema={AuthorSuggestFormSchema}
        title="Rancang Persona Penulis dengan AI"
        description="AI membaca author & bio yang sudah ada di WordPress Anda, lalu merancang profil author baru dengan suara unik, kredensial nyata, dan bio standar E-E-A-T."
        label="Instruksi / arahan profil penulis"
        placeholder="Contoh: Rancang 2 persona: satu master barista senior dengan 10 tahun pengalaman spesialis manual brew, dan satu roaster kopi muda…"
        presetsLabel="Contoh ide:"
        presets={PRESET_PROMPTS}
        submitLabel="Rancang Persona dengan AI"
        runningLabel="Memeriksa WordPress & merancang persona…"
        isRunning={run.isRunning}
        cooldownSeconds={run.cooldownSeconds}
        onRun={handleRun}
      />

      <ToolRunFeedback
        run={run}
        runningTitle="AI sedang membaca author WordPress & merancang persona…"
        runningDescription="Biasanya selesai dalam 10–40 detik. Meninggalkan halaman atau mengganti website membatalkan permintaan ini."
        errorFallback="Gagal merancang persona penulis dengan AI."
      />

      {run.data &&
        (run.data.suggestions.length === 0 ? (
          <EmptyState
            icon={Users}
            title="AI tidak menghasilkan persona baru"
            description="Coba instruksi yang lebih spesifik tentang bidang keahlian dan pengalaman penulis."
          />
        ) : (
          <AuthorSuggestionReview key={run.runId} siteId={siteId} suggestions={run.data.suggestions} />
        ))}
    </div>
  )
}

function AuthorSuggestionReview({ siteId, suggestions }: { siteId: string; suggestions: AuthorSuggestion[] }) {
  const queryClient = useQueryClient()
  const review = useSuggestionReview({
    items: suggestions,
    approve: (candidate: AuthorSuggestion) =>
      apiFetch<{ user: SiteAuthor }>(`/api/sites/${encodeURIComponent(siteId)}/authors`, {
        method: "POST",
        body: {
          username: candidate.username,
          name: candidate.name,
          email: candidate.email,
          roles: [candidate.role || "author"],
          description: candidate.bio,
        },
      }),
    resultId: ({ user }) => user.id,
    describe: (candidate) => `Author "${candidate.name}" (@${candidate.username})`,
    noun: "author",
    errorFallback: "Gagal membuat author di WordPress.",
    onApproved: () => queryClient.invalidateQueries({ queryKey: queryKeys.sites.authors(siteId) }),
  })

  return (
    <SuggestionList
      review={review}
      title="Kandidat Persona Baru"
      description="Tinjau profil, lalu setujui untuk mendaftarkannya sebagai user WordPress atau tolak bila tidak sesuai."
      approveLabel="Setujui & Buat di WordPress"
      approvedLabel="Aktif di WordPress sebagai author resmi"
      noun="author"
    >
      {suggestions.map((candidate, index) => (
        <SuggestionItem key={index} index={index}>
          <AuthorSuggestionContent candidate={candidate} />
        </SuggestionItem>
      ))}
    </SuggestionList>
  )
}

function AuthorSuggestionContent({ candidate }: { candidate: AuthorSuggestion }) {
  const expertise = splitExpertise(candidate.expertise)

  return (
    <>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <AuthorInitial name={candidate.name} className="size-9 text-sm" />
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-bold text-foreground">{candidate.name}</h3>
              <span className="font-mono text-xs text-muted-foreground">@{candidate.username}</span>
            </div>
            <span className="truncate font-mono text-xs text-muted-foreground">{candidate.email}</span>
          </div>
        </div>
        <Badge variant="outline" className="capitalize">
          {candidate.role}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-5 text-xs">
        {expertise.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-semibold text-foreground">Keahlian:</span>
            {expertise.map((item) => (
              <Badge key={item} variant="secondary" className="font-normal">
                {item}
              </Badge>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border/50 bg-muted/40 p-3">
          <p className="mb-1 font-semibold text-foreground">Biografi profil (E-E-A-T)</p>
          <p className="leading-relaxed text-muted-foreground">{candidate.bio}</p>
        </div>

        {candidate.rationale && (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Alasan kredibilitas:</strong> {candidate.rationale}
            </span>
          </p>
        )}
      </CardContent>
    </>
  )
}
