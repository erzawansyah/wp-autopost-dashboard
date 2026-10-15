"use client"

import { useMutation } from "@tanstack/react-query"
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/atoms/card"
import { apiFetch, isApiClientError } from "@/lib/api/client"
import { useSanitizedHtml } from "@/lib/sanitize-html"
import { useConfirm } from "@/lib/ui/confirm"
import { errorMessage, notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import type { LinkApplyResponse, LinkRecommendation } from "@/types/tools"
import { linkApplyErrorTitle, STRONG_RELEVANCE_SCORE } from "./tool-helpers"

/** Saran lanjutan per status kegagalan `link-building/apply`. */
const APPLY_ERROR_HINTS: Partial<Record<number, string>> = {
  409: "Jalankan analisis ulang agar AI membaca naskah terbaru.",
  502: "Pastikan website dapat diakses dan Application Password memiliki peran Editor/Administrator, lalu coba lagi.",
}

interface LinkRecommendationCardProps {
  siteId: string
  recommendation: LinkRecommendation
}

/** Satu titik sisip tautan: kalimat asli vs kalimat bertautan, salin HTML, dan sisipkan ke WordPress (dengan konfirmasi). */
export function LinkRecommendationCard({ siteId, recommendation: rec }: LinkRecommendationCardProps) {
  const confirm = useConfirm()
  // Kalimat bertautan berisi HTML dari LLM: sanitasi profil inline (hanya di browser).
  const sentenceHtml = useSanitizedHtml(rec.sentenceWithLink, "inline")
  const isStrong = rec.relevanceScore >= STRONG_RELEVANCE_SCORE

  const apply = useMutation({
    mutationFn: () =>
      apiFetch<LinkApplyResponse>("/api/tools/link-building/apply", {
        method: "POST",
        body: {
          siteId,
          postId: rec.postId,
          sentenceOriginal: rec.sentenceOriginal,
          sentenceWithLink: rec.sentenceWithLink,
        },
      }),
    onSuccess: ({ message }) => notify.success(message),
    onError: (error) => notify.error(error, { fallback: "Gagal menyisipkan tautan ke WordPress." }),
  })

  async function handleApply() {
    const ok = await confirm({
      title: `Sisipkan tautan ke "${rec.postTitle}"?`,
      description:
        "Artikel lama di WordPress langsung diperbarui: kalimat asli diganti dengan versi bertautan. Perubahan hanya bisa dibatalkan manual lewat editor/revisi WordPress.",
      confirmLabel: "Sisipkan Tautan",
    })
    if (ok) apply.mutate()
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(rec.sentenceWithLink)
      notify.success("HTML kalimat bertautan disalin ke clipboard.")
    } catch {
      notify.error("Gagal menyalin ke clipboard. Salin manual dari pratinjau.")
    }
  }

  const errorStatus = isApiClientError(apply.error) ? apply.error.status : undefined
  const errorHint = errorStatus === undefined ? undefined : APPLY_ERROR_HINTS[errorStatus]

  return (
    <Card
      aria-busy={apply.isPending || undefined}
      className={cn("gap-3.5 border-border/80 py-4 shadow-2xs", apply.isSuccess && "border-success/40 bg-success/5")}
    >
      <CardHeader className="flex flex-col gap-2 px-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              #{rec.postId}
            </Badge>
            <h3 className="truncate text-sm font-semibold text-foreground">{rec.postTitle}</h3>
          </div>
          <a
            href={rec.postLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1 rounded-sm text-xs text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="truncate">{rec.postLink}</span>
            <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
            <span className="sr-only">(buka di tab baru)</span>
          </a>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0",
            isStrong ? "border-success/30 bg-success/10 text-success-strong" : "border-warning/30 bg-warning/10 text-warning-strong"
          )}
        >
          {rec.relevanceScore}% relevan
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-5 text-xs">
        {rec.relevanceReason && (
          <p className="rounded-md border border-border/50 bg-muted/30 p-2.5 leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Alasan AI:</span> {rec.relevanceReason}
          </p>
        )}

        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-muted-foreground">Anchor text:</span>
          <Badge className="font-mono">{rec.anchorText}</Badge>
        </p>

        <figure className="flex flex-col gap-1">
          <figcaption className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Kalimat asli di naskah lama</figcaption>
          <blockquote className="rounded-md border border-border/60 bg-muted/40 p-2.5 font-mono leading-relaxed text-muted-foreground">
            &ldquo;{rec.sentenceOriginal}&rdquo;
          </blockquote>
        </figure>

        <figure className="flex flex-col gap-1">
          <figcaption className="text-2xs font-semibold tracking-wider text-primary uppercase">Sesudah disisipi tautan</figcaption>
          <blockquote
            className="rounded-md border border-primary/20 bg-primary/5 p-2.5 leading-relaxed text-foreground [&_a]:font-semibold [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: sentenceHtml ?? "" }}
          />
        </figure>

        {apply.isError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{linkApplyErrorTitle(apply.error)}</AlertTitle>
            <AlertDescription>
              <p>{errorMessage(apply.error, "Gagal menyisipkan tautan ke WordPress.")}</p>
              {errorHint && <p>{errorHint}</p>}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-5 pt-3 [.border-t]:pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={handleCopy} className="cursor-pointer text-xs">
          <Copy aria-hidden="true" data-icon="inline-start" />
          Salin HTML
        </Button>

        {apply.isSuccess ? (
          <span role="status" className="flex items-center gap-1.5 text-xs font-medium text-success-strong">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Tersisip di WordPress
          </span>
        ) : (
          <Button type="button" size="sm" onClick={handleApply} disabled={apply.isPending} className="cursor-pointer text-xs font-semibold">
            {apply.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
            ) : apply.isError ? (
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
            ) : (
              <Send aria-hidden="true" data-icon="inline-start" />
            )}
            {apply.isPending ? "Menyisipkan ke WordPress…" : apply.isError ? "Coba sisipkan lagi" : "Sisipkan ke WordPress"}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
