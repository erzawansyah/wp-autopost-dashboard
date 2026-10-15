"use client"

import { AlertCircle, CheckCircle2, ExternalLink, Search } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { JsonCodeViewer } from "@/components/molecules/json-code-viewer"
import { toolErrorLabel, type LabToolOutcome } from "@/components/organisms/lab/lab-run"

/** Subset keluaran tool riset/visual yang divisualisasikan (selebihnya tetap di Raw JSON). */
interface ToolOutputView {
  query?: string
  totalPhotos?: number
  photos?: Array<{ url: string; alt?: string; source?: string; width?: number; height?: number; caption?: string }>
  totalResults?: number
  results?: Array<{ title?: string; snippet?: string; url?: string }>
  title?: string
  url?: string
  wordCount?: number
  content?: string
  suggestions?: string[]
  postId?: number | string
  mediaId?: number | string
  sourceUrl?: string
  altText?: string
  caption?: string
}

function asOutputView(output: unknown): ToolOutputView {
  return typeof output === "object" && output !== null && !Array.isArray(output) ? (output as ToolOutputView) : {}
}

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex max-w-full items-center gap-1 truncate font-mono text-2xs text-primary hover:underline"
    >
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </a>
  )
}

function QueryHeader({ query, count }: { query?: string; count: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs text-muted-foreground">
      <span className="truncate">
        Kueri: <strong className="text-foreground">&quot;{query}&quot;</strong>
      </span>
      <Badge variant="outline" className="shrink-0 font-mono text-2xs">
        {count}
      </Badge>
    </div>
  )
}

function ToolVisual({ toolId, output }: { toolId: string; output: unknown }) {
  const view = asOutputView(output)

  if (toolId === "image_search" && view.photos) {
    return (
      <div className="flex flex-col gap-3">
        <QueryHeader query={view.query} count={`${view.totalPhotos ?? view.photos.length} foto`} />
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {view.photos.map((photo, index) => (
            <li key={`${photo.url}-${index}`} className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL eksternal dari tool/LLM; optimasi next/image ke host tak tepercaya = permukaan SSRF */}
              <img
                src={photo.url}
                alt={photo.alt ?? ""}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-36 w-full rounded-md border border-border/60 object-cover"
              />
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  {photo.source && (
                    <Badge variant="secondary" className="font-mono text-2xs uppercase">
                      {photo.source}
                    </Badge>
                  )}
                  {photo.width && photo.height && (
                    <span className="font-mono text-2xs text-muted-foreground">
                      {photo.width} × {photo.height}
                    </span>
                  )}
                </div>
                {photo.alt && <span className="line-clamp-1 font-semibold text-foreground">{photo.alt}</span>}
                {photo.caption && <span className="line-clamp-2 text-muted-foreground italic">{photo.caption}</span>}
                <ExternalAnchor href={photo.url}>{photo.url}</ExternalAnchor>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (toolId === "web_search" && view.results) {
    return (
      <div className="flex flex-col gap-3">
        <QueryHeader query={view.query} count={`${view.totalResults ?? view.results.length} sumber`} />
        <ol className="flex flex-col gap-2.5">
          {view.results.map((result, index) => (
            <li key={`${result.url}-${index}`} className="flex flex-col gap-1 rounded-lg border border-border/80 bg-muted/20 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold text-foreground">{result.title}</span>
                <Badge variant="secondary" className="shrink-0 font-mono text-2xs">
                  #{index + 1}
                </Badge>
              </div>
              {result.snippet && <p className="line-clamp-3 leading-relaxed text-muted-foreground">{result.snippet}</p>}
              {result.url && <ExternalAnchor href={result.url}>{result.url}</ExternalAnchor>}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (toolId === "web_reader") {
    const wordCount = view.wordCount ?? (view.content ? view.content.split(/\s+/).filter(Boolean).length : 0)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs">
          <span className="truncate font-semibold text-foreground">{view.title || view.url || "Konten web terbaca"}</span>
          <Badge variant="outline" className="shrink-0 font-mono text-2xs">
            {wordCount} kata
          </Badge>
        </div>
        <div className="max-h-[30rem] overflow-y-auto rounded-lg border border-border/80 bg-muted/20 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {view.content || "Tidak ada teks yang terbaca."}
        </div>
      </div>
    )
  }

  if (toolId === "keyword_suggestions" && view.suggestions) {
    return (
      <div className="flex flex-col gap-3">
        <QueryHeader query={view.query} count={`${view.suggestions.length} saran LSI`} />
        <ul className="flex flex-wrap gap-2">
          {view.suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion}-${index}`}
              className="flex items-center gap-1 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-2xs"
            >
              <Search aria-hidden="true" className="size-3 shrink-0 text-primary" />
              {suggestion}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (toolId === "wordpress_publisher" || toolId === "upload_media") {
    const isPublisher = toolId === "wordpress_publisher"
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="success">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>{isPublisher ? "Artikel terkirim ke WordPress" : "Media terunggah ke WordPress"}</AlertTitle>
          <AlertDescription>
            {isPublisher && view.postId !== undefined && <span className="font-mono">Post ID: #{view.postId}</span>}
            {!isPublisher && view.mediaId !== undefined && <span className="font-mono">Media ID: #{view.mediaId}</span>}
            {isPublisher && view.url && <ExternalAnchor href={view.url}>Buka postingan di WordPress</ExternalAnchor>}
          </AlertDescription>
        </Alert>
        {!isPublisher && view.sourceUrl && (
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL media WordPress milik pengguna; optimasi next/image ke host tak tepercaya = permukaan SSRF */}
            <img
              src={view.sourceUrl}
              alt={view.altText ?? ""}
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-48 w-full rounded-md border border-border/60 object-cover"
            />
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <dt className="font-semibold text-foreground">Judul</dt>
              <dd>{view.title || "-"}</dd>
              <dt className="font-semibold text-foreground">Alt text</dt>
              <dd>{view.altText || "-"}</dd>
              <dt className="font-semibold text-foreground">Caption</dt>
              <dd>{view.caption || "-"}</dd>
            </dl>
          </div>
        )}
      </div>
    )
  }

  return <JsonCodeViewer title="Keluaran tool" data={output} maxHeight="max-h-[28rem]" />
}

interface LabToolResultProps {
  toolId: string
  toolName: string
  outcome: LabToolOutcome
}

/** Hasil satu uji tool: kegagalan `ToolOutcome` ({ code, retryable }) atau keluaran visual + Raw JSON. */
export function LabToolResult({ toolId, toolName, outcome }: LabToolResultProps) {
  if (!outcome.ok) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Eksekusi tool gagal</AlertTitle>
        <AlertDescription>
          <p>{outcome.message}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {outcome.code && (
              <Badge variant="outline" className="border-destructive/30 font-mono text-2xs text-destructive-strong">
                {outcome.code}
              </Badge>
            )}
            {outcome.code && <span>{toolErrorLabel(outcome.code)}</span>}
            {outcome.retryable !== undefined && (
              <Badge variant="outline" className="text-2xs text-foreground">
                {outcome.retryable ? "Dapat dicoba ulang" : "Tidak layak dicoba ulang"}
              </Badge>
            )}
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Tabs defaultValue="visual" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="visual" className="text-xs">
          Tampilan Visual
        </TabsTrigger>
        <TabsTrigger value="raw" className="text-xs">
          Raw JSON
        </TabsTrigger>
      </TabsList>
      <TabsContent value="visual" className="flex flex-col gap-3 pt-2">
        {outcome.summary && <p className="text-xs text-muted-foreground">{outcome.summary}</p>}
        <ToolVisual toolId={toolId} output={outcome.output} />
      </TabsContent>
      <TabsContent value="raw" className="pt-2">
        <JsonCodeViewer title={`Output: ${toolName}`} data={outcome.output} maxHeight="max-h-[30rem]" />
      </TabsContent>
    </Tabs>
  )
}
