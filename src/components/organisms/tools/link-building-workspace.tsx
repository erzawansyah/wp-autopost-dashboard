"use client"

import * as React from "react"
import { FileText, Link2, SlidersHorizontal } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { EmptyState } from "@/components/molecules/empty-state"
import { notify } from "@/lib/ui/notify"
import type { LinkAnalyzeInput } from "@/lib/validation/tools"
import type { InternalLinkAnalysis } from "@/types/tools"
import { LinkAnalyzeForm } from "./link-analyze-form"
import { LinkRecommendationCard } from "./link-recommendation-card"
import { ToolRunFeedback } from "./tool-run-feedback"
import { useToolSite } from "./tool-site-context"
import { useToolRun } from "./use-tool-run"

/** Isi halaman Link Building: target artikel baru (kiri) → rekomendasi titik sisip tautan per artikel lama (kanan). */
export function LinkBuildingWorkspace() {
  const { site, siteId } = useToolSite()
  const run = useToolRun<LinkAnalyzeInput, InternalLinkAnalysis>("/api/tools/link-building/analyze", siteId)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-4">
        <LinkAnalyzeForm
          siteBaseUrl={site?.base_url ?? ""}
          isRunning={run.isRunning}
          cooldownSeconds={run.cooldownSeconds}
          onAnalyze={(values) =>
            run.run(
              {
                siteId,
                newArticleUrl: values.newArticleUrl,
                targetKeyword: values.targetKeyword || undefined,
                extraInstructions: values.extraInstructions || undefined,
              },
              {
                onSuccess: ({ recommendations }) => {
                  if (recommendations.length > 0) notify.success(`Ditemukan ${recommendations.length} titik sisip tautan.`)
                },
              }
            )
          }
        />

        <Alert role="note" className="border-border/70 bg-muted/20">
          <SlidersHorizontal aria-hidden="true" className="text-primary" />
          <AlertTitle>Cara AI memproses</AlertTitle>
          <AlertDescription>
            <ol className="list-inside list-decimal text-muted-foreground">
              <li>Ekstraksi topik &amp; perumusan 3–4 query pencarian.</li>
              <li>Pencarian artikel terbitan lama via WP REST API.</li>
              <li>Analisis naskah lama &amp; pemilihan anchor text alami.</li>
              <li>Penyisipan ke WordPress setelah Anda konfirmasi.</li>
            </ol>
          </AlertDescription>
        </Alert>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-8">
        <ToolRunFeedback
          run={run}
          runningTitle="AI sedang membedah naskah WordPress…"
          runningDescription="Merumuskan query, menelusuri artikel lama yang relevan, lalu mencari kalimat terbaik untuk disisipi tautan. Meninggalkan halaman atau mengganti website membatalkan permintaan ini."
          errorFallback="Gagal menganalisis artikel dengan AI."
        />

        {run.data ? (
          <LinkRecommendationResults key={run.runId} siteId={siteId} analysis={run.data} />
        ) : (
          !run.isRunning &&
          !run.error && (
            <EmptyState
              icon={Link2}
              title="Belum ada rekomendasi"
              description="Masukkan URL artikel baru Anda lalu klik “Riset & Temukan Artikel Lama” untuk memulai pemindaian otomatis."
            />
          )
        )}
      </div>
    </div>
  )
}

function LinkRecommendationResults({ siteId, analysis }: { siteId: string; analysis: InternalLinkAnalysis }) {
  const { newArticleUrl, recommendations, searchQueries, topicSummary, message } = analysis
  const headingId = React.useId()

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText aria-hidden="true" className="size-4 text-primary" />
          Ditemukan {recommendations.length} rekomendasi titik sisipan
        </h2>
        {topicSummary && <p className="text-xs text-muted-foreground">Topik artikel: {topicSummary}</p>}
        {searchQueries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Query WordPress:</span>
            {searchQueries.map((query) => (
              <Badge key={query} variant="outline" className="font-normal">
                {query}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {recommendations.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Tidak ada artikel lama yang cocok"
          description={
            message ??
            "Tidak ditemukan artikel lama di website ini yang cocok secara kontekstual untuk disisipi tautan ke artikel baru."
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {recommendations.map((recommendation, index) => (
            <li key={`${recommendation.postId}-${index}`}>
              <LinkRecommendationCard siteId={siteId} newArticleUrl={newArticleUrl} recommendation={recommendation} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
