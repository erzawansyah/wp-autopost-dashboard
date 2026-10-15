"use client"

import { AlertCircle, AlertTriangle, Code, ExternalLink, Eye, FileText, Gauge, Layers } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { JsonCodeViewer } from "@/components/molecules/json-code-viewer"
import {
  formatCount,
  formatDuration,
  formatUsd,
  toolErrorLabel,
  type LabAgentRun,
} from "@/components/organisms/lab/lab-run"
import { useSanitizedHtml } from "@/lib/sanitize-html"

function ArticlePreview({ run }: { run: LabAgentRun }) {
  const { article, enrichment } = run
  const safeHtml = useSanitizedHtml(article?.contentHtml)
  const featured = enrichment?.featuredImage
  const featuredSrc = featured?.imageUrl || featured?.originalUrl
  const inContentImages = enrichment?.inContentImages ?? []

  return (
    <div className="flex flex-col gap-4">
      {featured && featuredSrc && (
        <figure className="overflow-hidden rounded-xl border border-border/80 bg-muted/30 shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL eksternal dari tool/LLM; optimasi next/image ke host tak tepercaya = permukaan SSRF */}
          <img
            src={featuredSrc}
            alt={featured.altText ?? ""}
            referrerPolicy="no-referrer"
            className="h-52 w-full object-cover sm:h-64"
          />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-card/60 p-3 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <Badge variant="secondary" className="shrink-0 text-2xs">
                Featured image {enrichment?.featuredMedia ? `• WP #${enrichment.featuredMedia}` : "• Simulasi"}
              </Badge>
              <span className="truncate font-medium text-foreground">{featured.title || "Gambar sampul"}</span>
            </span>
            {featured.originalUrl && (
              <a
                href={featured.originalUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Sumber foto <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            )}
          </figcaption>
        </figure>
      )}

      <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6">
        <header className="flex flex-col gap-3 border-b border-border/70 pb-4">
          <h3 className="text-xl leading-snug font-bold tracking-tight text-foreground">{article?.title || "Tanpa judul"}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {article?.readingTimeMinutes ?? 1} menit membaca
            </Badge>
            {article?.wordCount !== undefined && (
              <Badge variant="outline" className="text-xs">
                {formatCount(article.wordCount)} kata
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-2xs text-muted-foreground">
              Draft
            </Badge>
          </div>
        </header>
        {safeHtml ? (
          <div
            className="prose max-h-[32rem] max-w-none overflow-y-auto pr-1 text-xs leading-relaxed sm:text-sm dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">{article?.contentHtml ? "Menyiapkan pratinjau…" : "Konten belum tersedia."}</p>
        )}

        {inContentImages.length > 0 && (
          <section aria-label="Media dalam subbab" className="flex flex-col gap-2 border-t border-border/70 pt-4">
            <h4 className="text-xs font-semibold text-foreground">Media tersemat dalam subbab ({inContentImages.length})</h4>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {inContentImages.map((image, index) => (
                <li key={`${image.imageUrl}-${index}`} className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL eksternal dari tool/LLM; optimasi next/image ke host tak tepercaya = permukaan SSRF */}
                  <img
                    src={image.imageUrl || image.originalUrl}
                    alt={image.altText ?? ""}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="h-12 w-16 shrink-0 rounded border border-border object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold text-foreground">{image.subheading || `Subbab #${index + 1}`}</span>
                    <span className="truncate text-muted-foreground">Alt: {image.altText}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  )
}

function TelemetryPanel({ run }: { run: LabAgentRun }) {
  const execution = run.execution
  const tokens = execution?.tokenUsage
  const modelUsage = execution?.modelUsage ?? []
  const warnings = execution?.warnings ?? []
  const steps = execution?.stepEvents ?? []
  const metrics: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Model", value: execution?.modelUsed || "—" },
    {
      label: "Token",
      value: formatCount(tokens?.total),
      hint: tokens ? `prompt ${formatCount(tokens.prompt)} • completion ${formatCount(tokens.completion)}` : undefined,
    },
    { label: "Biaya", value: formatUsd(execution?.costUsd), hint: "Menurut OpenRouter" },
    { label: "Panggilan LLM", value: formatCount(execution?.llmCalls) },
    { label: "Durasi", value: formatDuration(run.durationMs) },
    { label: "Retry", value: formatCount(execution?.retries) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-muted/20 p-2.5">
            <dt className="font-mono text-2xs font-semibold tracking-wider text-muted-foreground uppercase">{metric.label}</dt>
            <dd className="truncate font-mono text-sm font-semibold text-foreground" title={metric.value}>
              {metric.value}
            </dd>
            {metric.hint && <dd className="truncate text-2xs text-muted-foreground">{metric.hint}</dd>}
          </div>
        ))}
      </dl>

      {modelUsage.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Pemakaian token & biaya per model</caption>
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th scope="col" className="p-2 font-medium">Model</th>
                <th scope="col" className="p-2 text-right font-medium">Panggilan</th>
                <th scope="col" className="p-2 text-right font-medium">Token</th>
                <th scope="col" className="p-2 text-right font-medium">Biaya</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {modelUsage.map((usage) => (
                <tr key={usage.model}>
                  <td className="p-2 font-mono">{usage.model}</td>
                  <td className="p-2 text-right font-mono">{formatCount(usage.calls)}</td>
                  <td className="p-2 text-right font-mono">{formatCount(usage.totalTokens)}</td>
                  <td className="p-2 text-right font-mono">{formatUsd(usage.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Peringatan run ({warnings.length})</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {(execution?.nodesExecuted?.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Tahap:</span> {execution?.nodesExecuted?.join(" → ")}
        </p>
      )}

      {steps.length > 0 && (
        <ol className="flex flex-col gap-1.5" aria-label="Langkah agen">
          {steps.map((step) => (
            <li key={`${step.index}-${step.timestamp}`} className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/10 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-2xs text-muted-foreground">#{step.index}</span>
                <Badge variant="secondary" className="font-mono text-2xs">
                  {step.kind}
                </Badge>
                {step.tool && <code className="font-mono text-2xs text-foreground">{step.tool}</code>}
                <Badge variant={step.status === "ok" ? "success" : "warning"} className="text-2xs">
                  {step.status}
                </Badge>
                <span className="ml-auto font-mono text-2xs text-muted-foreground">{formatDuration(step.durationMs)}</span>
              </div>
              <p className="leading-relaxed text-foreground/85">{step.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Hasil uji Agent Profile: error terstruktur, pratinjau naskah (HTML tersanitasi), blok, Markdown, telemetri. */
export function LabAgentRunResult({ run }: { run: LabAgentRun }) {
  return (
    <div className="flex flex-col gap-4">
      {run.error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Run Agent Profile terhenti</AlertTitle>
          <AlertDescription>
            <p>{run.error.message}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {run.error.code && (
                <Badge variant="destructive" className="font-mono text-2xs">
                  {run.error.code}
                </Badge>
              )}
              {run.error.code && toolErrorLabel(run.error.code) !== run.error.code && <span>{toolErrorLabel(run.error.code)}</span>}
              {run.error.retryable !== undefined && (
                <Badge variant="outline" className="text-2xs text-foreground">
                  {run.error.retryable ? "Dapat dicoba ulang" : "Tidak layak dicoba ulang"}
                </Badge>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={run.article ? "preview" : "telemetry"} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="preview" aria-label="Pratinjau" className="gap-1.5 text-xs">
            <Eye aria-hidden="true" />
            <span className="hidden sm:inline">Pratinjau</span>
          </TabsTrigger>
          <TabsTrigger value="gutenberg" aria-label="Gutenberg" className="gap-1.5 text-xs">
            <Code aria-hidden="true" />
            <span className="hidden sm:inline">Gutenberg</span>
          </TabsTrigger>
          <TabsTrigger value="markdown" aria-label="Markdown" className="gap-1.5 text-xs">
            <FileText aria-hidden="true" />
            <span className="hidden sm:inline">Markdown</span>
          </TabsTrigger>
          <TabsTrigger value="telemetry" aria-label="Telemetri" className="gap-1.5 text-xs">
            <Gauge aria-hidden="true" />
            <span className="hidden sm:inline">Telemetri</span>
          </TabsTrigger>
          <TabsTrigger value="raw" aria-label="Raw JSON" className="gap-1.5 text-xs">
            <Layers aria-hidden="true" />
            <span className="hidden sm:inline">Raw JSON</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="pt-2">
          <ArticlePreview run={run} />
        </TabsContent>
        <TabsContent value="gutenberg" className="pt-2">
          <JsonCodeViewer title="Blok Gutenberg (<!-- wp:... -->)" data={run.article?.contentHtml ?? ""} rawText maxHeight="max-h-[32rem]" />
        </TabsContent>
        <TabsContent value="markdown" className="pt-2">
          <JsonCodeViewer title="Naskah Markdown" data={run.article?.markdownContent ?? ""} rawText maxHeight="max-h-[32rem]" />
        </TabsContent>
        <TabsContent value="telemetry" className="pt-2">
          <TelemetryPanel run={run} />
        </TabsContent>
        <TabsContent value="raw" className="pt-2">
          <JsonCodeViewer title="Payload lengkap (artikel, enrichment, telemetri)" data={run.raw} maxHeight="max-h-[32rem]" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
