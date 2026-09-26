"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Badge } from "@/components/atoms/badge"
import { CheckCircle2, BookOpen, Layers, Cpu, Wrench, ShieldCheck, Zap } from "lucide-react"

export function LabDocsViewer() {
  return (
    <div className="flex flex-col gap-6">
      {/* Intro Philosophy Card */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              Filosofi Desain Modular System Writer (Engine ➔ Node ➔ Tool)
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Arsitektur bertingkat untuk membangun pipeline pembuatan konten AI yang transparan, mudah diuji (*testable*), dan bebas dari keterikatan monolitik.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-xs leading-relaxed text-foreground">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-4">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Wrench className="size-4" />
                <span>1. Level Tools (I/O)</span>
              </div>
              <p className="text-muted-foreground">
                Adapter fungsi murni yang berinteraksi langsung dengan REST API WordPress (kategori, tag, author, posting). Tidak bergantung pada state AI.
              </p>
              <div className="mt-auto pt-2 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">get_categories</Badge>
                <Badge variant="outline" className="text-[10px]">get_tags</Badge>
                <Badge variant="outline" className="text-[10px]">create_tags</Badge>
                <Badge variant="outline" className="text-[10px]">get_author</Badge>
                <Badge variant="outline" className="text-[10px]">wordpress_publisher</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-4">
              <div className="flex items-center gap-2 font-semibold text-accent">
                <Cpu className="size-4" />
                <span>2. Level Nodes</span>
              </div>
              <p className="text-muted-foreground">
                Unit logika spesifik yang didefinisikan via <code className="font-mono text-foreground font-semibold">defineNode()</code>. Menerima <code className="font-mono text-foreground">WriterState</code>, mengeksekusi prompt/alat, dan mengembalikan state delta.
              </p>
              <div className="mt-auto pt-2 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">input-validator</Badge>
                <Badge variant="outline" className="text-[10px]">taxonomy-resolver</Badge>
                <Badge variant="outline" className="text-[10px]">article-drafter</Badge>
                <Badge variant="outline" className="text-[10px]">quality-checker</Badge>
                <Badge variant="outline" className="text-[10px]">gutenberg-formatter</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-4">
              <div className="flex items-center gap-2 font-semibold text-amber-500">
                <Zap className="size-4" />
                <span>3. Level Engines</span>
              </div>
              <p className="text-muted-foreground">
                Orkestrator LangGraph StateGraph yang menghubungkan node-node dalam alur terarah (dengan conditional edges untuk quality check atau error branching).
              </p>
              <div className="mt-auto pt-2 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">QuickEngine (Aktif)</Badge>
                <Badge variant="secondary" className="text-[10px]">ComprehensiveEngine (Next)</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standar & Format Baku */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-500" />
              <CardTitle className="text-sm font-semibold">Standar Penulisan & Format Konten</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-xs text-muted-foreground leading-relaxed">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span><strong>Markdown-First</strong>: AI LLM selalu menghasilkan Markdown bersih bebas format aneh, meminimalkan token dan mempermudah audit.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span><strong>Native Gutenberg Serializer</strong>: Konversi deterministik ke blok WordPress (<code className="font-mono text-foreground">&lt;!-- wp:... --&gt;</code>) sebelum dikirim ke endpoint WP REST API.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span><strong>Templating `prompt.md`</strong>: Node AI memuat template prompt terpisah dengan frontmatter YAML dan tag <code className="font-mono text-foreground">[SYSTEM_PROMPT]</code> & <code className="font-mono text-foreground">[USER_PROMPT]</code> via <code className="font-mono text-foreground">loadNodePrompt()</code>.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span><strong>Zero Secret Leaks</strong>: Kredensial Application Password selalu didekripsi hanya di memori server dan tidak pernah dikembalikan ke browser.</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Checklist Kematangan Modul Quick Writer</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5 text-xs text-muted-foreground">
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-2">
              <span className="font-medium text-foreground">Tools WordPress REST API (5 Tools)</span>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">100% Siap</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-2">
              <span className="font-medium text-foreground">Modular Nodes via defineNode (5 Nodes)</span>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">100% Siap</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-2">
              <span className="font-medium text-foreground">QuickEngine LangGraph StateGraph</span>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">100% Siap</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-2">
              <span className="font-medium text-foreground">Laboratorium & Test Bench Interaktif (`/lab`)</span>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">Aktif</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-2">
              <span className="font-medium text-foreground">Frontend Quick Writer Baru (`/posts/new`)</span>
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">Siap Dirombak</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
