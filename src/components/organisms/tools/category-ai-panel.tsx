"use client"

import { useQueryClient } from "@tanstack/react-query"
import { CornerDownRight, FolderTree } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { EmptyState } from "@/components/molecules/empty-state"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { notify } from "@/lib/ui/notify"
import { CategorySuggestFormSchema, type WpToolPromptInput } from "@/lib/validation/tools"
import type { SiteCategory } from "@/types/site"
import type { CategorySuggestion, CategorySuggestResponse } from "@/types/tools"
import { SuggestionItem, SuggestionList } from "./suggestion-list"
import { ToolPromptForm } from "./tool-prompt-form"
import { ToolRunFeedback } from "./tool-run-feedback"
import { useSuggestionReview } from "./use-suggestion-review"
import { useToolRun } from "./use-tool-run"

const PRESET_PROMPTS = [
  "Sub-kategori Alat Seduh Kopi & Teknik Manual Brew",
  "Taksonomi Edukasi, Panduan Pemula, & Tips Barista",
  "Ulasan Biji Kopi Nusantara & Profil Roastery",
  "Bisnis Kedai Kopi, Manajemen Kafe, & Wirausaha",
] as const

/** Asisten AI Kategori Creator: instruksi → rekomendasi taksonomi → setujui per item → dibuat di WordPress. */
export function CategoryAiPanel({ siteId }: { siteId: string }) {
  const run = useToolRun<WpToolPromptInput, CategorySuggestResponse>("/api/tools/categories/suggest", siteId)

  function handleRun(prompt: string) {
    run.run(
      { siteId, prompt },
      {
        onSuccess: ({ suggestions }) => {
          if (suggestions.length > 0) notify.success(`AI merancang ${suggestions.length} rekomendasi kategori baru.`)
        },
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ToolPromptForm
        schema={CategorySuggestFormSchema}
        title="Rancang Taksonomi Kategori dengan AI"
        description="Beri arahan topik. AI membaca struktur kategori yang sudah ada di WordPress lalu menyusun kategori baru yang tidak tumpang tindih, lengkap dengan deskripsi SEO."
        label="Instruksi / arahan topik kategori"
        placeholder="Contoh: Rancang sub-kategori seputar specialty coffee, metode manual brew (V60, Aeropress), dan tips barista untuk pemula…"
        presetsLabel="Ide topik:"
        presets={PRESET_PROMPTS}
        submitLabel="Rancang Kategori dengan AI"
        runningLabel="Menganalisis kategori & merancang…"
        isRunning={run.isRunning}
        cooldownSeconds={run.cooldownSeconds}
        onRun={handleRun}
      />

      <ToolRunFeedback
        run={run}
        runningTitle="AI sedang membaca kategori WordPress & merancang taksonomi…"
        runningDescription="Biasanya selesai dalam 10–40 detik. Meninggalkan halaman atau mengganti website membatalkan permintaan ini."
        errorFallback="Gagal merancang kategori dengan AI."
      />

      {run.data &&
        (run.data.suggestions.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="AI tidak menemukan kategori baru"
            description="Struktur kategori situs ini mungkin sudah mencakup topik tersebut. Coba instruksi yang lebih spesifik."
          />
        ) : (
          <CategorySuggestionReview key={run.runId} siteId={siteId} suggestions={run.data.suggestions} />
        ))}
    </div>
  )
}

function CategorySuggestionReview({ siteId, suggestions }: { siteId: string; suggestions: CategorySuggestion[] }) {
  const queryClient = useQueryClient()
  const review = useSuggestionReview({
    items: suggestions,
    approve: (suggestion: CategorySuggestion) =>
      apiFetch<{ category: SiteCategory }>(`/api/sites/${encodeURIComponent(siteId)}/categories`, {
        method: "POST",
        body: {
          name: suggestion.name,
          slug: suggestion.slug,
          parent: suggestion.parentId || 0,
          description: suggestion.description,
        },
      }),
    resultId: ({ category }) => category.id,
    describe: (suggestion) => `Kategori "${suggestion.name}"`,
    noun: "kategori",
    errorFallback: "Gagal membuat kategori di WordPress.",
    onApproved: () => queryClient.invalidateQueries({ queryKey: queryKeys.sites.categories(siteId) }),
  })

  return (
    <SuggestionList
      review={review}
      title="Rekomendasi Kategori Baru"
      description="Tinjau setiap kategori, lalu setujui untuk membuatnya di WordPress atau tolak bila tidak sesuai."
      approveLabel="Setujui & Buat"
      approvedLabel="Aktif di WordPress"
      noun="kategori"
    >
      {suggestions.map((suggestion, index) => (
        <SuggestionItem key={index} index={index}>
          <CategorySuggestionContent suggestion={suggestion} />
        </SuggestionItem>
      ))}
    </SuggestionList>
  )
}

function CategorySuggestionContent({ suggestion }: { suggestion: CategorySuggestion }) {
  const isChild = suggestion.parentId > 0

  return (
    <>
      <CardHeader className="px-5">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">{suggestion.name}</h3>
          {suggestion.slug && (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-normal text-muted-foreground">/{suggestion.slug}</code>
          )}
          {isChild ? (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              <CornerDownRight aria-hidden="true" className="text-primary" />
              Sub dari: {suggestion.parentName || `ID #${suggestion.parentId}`}
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-normal">
              Kategori induk
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-5 text-xs leading-relaxed">
        {suggestion.description && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Deskripsi SEO:</span> {suggestion.description}
          </p>
        )}
        {suggestion.rationale && (
          <p className="rounded-md border border-border/50 bg-muted/40 p-2 text-muted-foreground">
            <span className="font-semibold text-foreground">Alasan AI:</span> {suggestion.rationale}
          </p>
        )}
      </CardContent>
    </>
  )
}
