"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import {
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  ListOrdered,
  Clock,
  Layers,
  Globe,
} from "lucide-react"
import {
  NodeExecutionLogsViewer,
  type NodeExecutionLogItem,
} from "@/components/organisms/node-execution-logs-viewer"

export interface QuickWriterCompletedResult {
  title: string
  state: string
  wpPostId?: number
  wpPostUrl?: string
  readingTimeMinutes?: number
  modelUsed?: string
  engineUsed?: string
  message: string
  siteName?: string
  siteUrl?: string
}

interface QuickWriterResultCardProps {
  result: QuickWriterCompletedResult
  nodeLogs?: NodeExecutionLogItem[]
  onReset: () => void
}

export function QuickWriterResultCard({
  result,
  nodeLogs = [],
  onReset,
}: QuickWriterResultCardProps) {
  const isPublished = result.state === "published_on_wp"

  return (
    <div className="flex flex-col gap-6 animate-in fade-in-50 duration-300">
      <Card className="border-emerald-500/40 bg-card shadow-xs overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-primary" />
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">
                  Artikel Berhasil Diproses!
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {result.message}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  isPublished
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium"
                }
              >
                {isPublished ? "Tayang Publik (Live)" : "Tersimpan di Draf WP"}
              </Badge>
              <Badge variant="secondary" className="text-[11px] gap-1 font-mono">
                <Layers className="size-3 text-primary" />
                <span>Gutenberg Native</span>
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5 pt-2">
          {/* Box Rincian Artikel */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Naskah Terbit di WordPress
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {result.engineUsed && (
                  <span className="font-mono text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                    Engine: {result.engineUsed}
                  </span>
                )}
                {result.modelUsed && (
                  <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded text-foreground/80">
                    Model: {result.modelUsed}
                  </span>
                )}
              </div>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-foreground leading-snug">
              {result.title}
            </h3>

            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1 border-t border-border/50">
              {result.readingTimeMinutes && (
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-primary" />
                  <span>Estimasi waktu baca: ~{result.readingTimeMinutes} menit</span>
                </div>
              )}
              {result.siteName && (
                <div className="flex items-center gap-1.5">
                  <Globe className="size-3.5 text-muted-foreground" />
                  <span>Website: {result.siteName}</span>
                </div>
              )}
              {result.wpPostId && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  ID Post WP: #{result.wpPostId}
                </span>
              )}
            </div>
          </div>

          {/* Tombol Aksi Navigasi */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReset}
                className="gap-2 text-xs cursor-pointer font-medium"
              >
                <RotateCcw className="size-3.5" />
                <span>Tulis Artikel Lain</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                asChild
                className="gap-2 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Link href="/posts">
                  <ListOrdered className="size-3.5" />
                  <span>Daftar Artikel</span>
                </Link>
              </Button>
            </div>

            {result.wpPostUrl ? (
              <Button
                size="sm"
                asChild
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-2xs cursor-pointer"
              >
                <a
                  href={result.wpPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center"
                >
                  <span>Buka Artikel di WordPress</span>
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            ) : (
              <Button
                size="sm"
                asChild
                variant="secondary"
                className="gap-2 text-xs font-medium cursor-pointer"
              >
                <Link href="/posts">
                  <span>Periksa di Antrean Artikel</span>
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Telemetri Node Logs LangGraph */}
      {nodeLogs && nodeLogs.length > 0 && (
        <NodeExecutionLogsViewer logs={nodeLogs} defaultOpen={false} />
      )}
    </div>
  )
}
