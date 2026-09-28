"use client"

import * as React from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import {
  FlaskConical,
  Wrench,
  Cpu,
  Zap,
  ArrowRight,
  Sparkles,
  LayoutTemplate,
} from "lucide-react"

export default function NewPostPage() {
  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header */}
        <PageHeader
          title="Tulis Cepat (Quick Writer)"
          description="Modul pembuatan artikel cepat sedang dikosongkan untuk perombakan UI berbasis Atomic Design dan pematangan engine bertahap (bottom-up)."
          icon={Sparkles}
          badge={
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono border-amber-500/40 text-amber-500">
              Fase Refaktor
            </Badge>
          }
          actions={
            <Button size="sm" asChild className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs shadow-2xs font-semibold">
              <Link href="/lab">
                <FlaskConical className="size-3.5 text-accent" />
                <span>Buka Laboratorium</span>
              </Link>
            </Button>
          }
        />

        {/* Hero Card Call to Action */}
        <Card className="border-border bg-gradient-to-br from-card to-muted/30 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <FlaskConical className="size-4" />
                </div>
                <CardTitle className="text-base font-semibold">
                  Laboratorium & Test Bench Tersedia
                </CardTitle>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                Siap Diuji
              </Badge>
            </div>
            <CardDescription className="text-xs pt-1 leading-relaxed">
              Anda dapat menguji seluruh <strong>Tools</strong>, <strong>Nodes</strong>, dan <strong>Engine</strong> secara mandiri dan transparan melalui halaman Laboratorium sebelum antarmuka pengguna final dirakit.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button asChild size="default" className="gap-2 font-medium">
                <Link href="/lab">
                  <FlaskConical className="size-4" />
                  <span>Buka Laboratorium Pengujian (/lab)</span>
                  <ArrowRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Roadmap Tahap Pengembangan Bottom-Up */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Tahapan Pematangan Bottom-Up
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Tools */}
            <Card className="border-border bg-card">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary mt-0.5">
                  <Wrench className="size-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">1. Tools WordPress REST</span>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Lolos Uji</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    5 adapter terisolasi: get_categories, get_tags, create_tags, get_author, wordpress_publisher.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Nodes */}
            <Card className="border-border bg-card">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/20 text-accent mt-0.5">
                  <Cpu className="size-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">2. Modular Nodes</span>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Lolos Uji</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    5 node fungsional via defineNode() dengan YAML prompt.md terpisah & telemetri otomatis.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Engine */}
            <Card className="border-border bg-card">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500 mt-0.5">
                  <Zap className="size-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">3. QuickEngine (LangGraph)</span>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Lolos Uji</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Orkestrator StateGraph dengan conditional quality check dan Gutenberg block serializer.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Step 4: UI Refactor */}
            <Card className="border-border bg-card">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-500 mt-0.5">
                  <LayoutTemplate className="size-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">4. Perombakan Frontend</span>
                    <Badge variant="secondary" className="text-[10px]">Langkah Selanjutnya</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Penyusunan antarmuka baru secara modular menggunakan prinsip Atomic Design (atoms ➔ molecules ➔ organisms).
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
