"use client"

import * as React from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { FormField } from "@/components/molecules/form-field"
import { OpenrouterModelPicker } from "@/components/molecules/openrouter-model-picker"
import {
  Bot,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react"

import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { REASONING_EFFORT_OPTIONS, ReasoningEffort } from "@/lib/ai/reasoning"
import type { UserSettingsResponse } from "@/types/settings"

export default function AiSettingsPage() {
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_AI_MODEL)
  const [reasoningEffort, setReasoningEffort] = React.useState<ReasoningEffort>("low")
  const [openrouterConfigured, setOpenrouterConfigured] = React.useState<boolean | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isSaved, setIsSaved] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Muat model dari localStorage (bukan rahasia) lalu sinkronkan dengan database
    const handle = requestAnimationFrame(() => {
      const savedModel = localStorage.getItem("custom_openrouter_model") || DEFAULT_AI_MODEL
      setSelectedModel(savedModel)

      fetch("/api/settings/user")
        .then((res) => res.json())
        .then((data: UserSettingsResponse) => {
          if (!data.ok) return
          setOpenrouterConfigured(Boolean(data.keys?.openrouter?.configured))
          if (data.defaultAiModel) {
            setSelectedModel(data.defaultAiModel)
            localStorage.setItem("custom_openrouter_model", data.defaultAiModel)
          }
          if (data.reasoningEffort) {
            setReasoningEffort(data.reasoningEffort)
          } else if (data.searchPreferences?.reasoning_effort) {
            setReasoningEffort(data.searchPreferences.reasoning_effort)
          }
        })
        .catch(() => {})
    })
    return () => cancelAnimationFrame(handle)
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setErrorMessage(null)

    // Hanya preferensi model; kunci API dikelola di /settings/keys (terenkripsi di server)
    try {
      const res = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultAiModel: selectedModel,
          reasoningEffort,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setErrorMessage(data?.error || "Gagal menyimpan pengaturan model AI.")
        return
      }
      try {
        localStorage.setItem("custom_openrouter_model", selectedModel)
      } catch {
        // localStorage tidak tersedia (mode privat); model tetap tersimpan di database
      }
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan saat menyimpan pengaturan model AI.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Title */}
        <PageHeader
          title="Pengaturan Model AI"
          description="Pilih model default dan tingkat penalaran AI untuk pembuatan artikel otomatis. Kunci API OpenRouter dikelola di Pusat Kunci API."
          icon={Bot}
          backHref="/settings"
          backLabel="Kembali ke Pengaturan"
        />

        {/* Main Settings Card */}
        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="pb-4 border-b border-border/80">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              <span>Model AI Default</span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Model dan tingkat penalaran ini dipakai otomatis oleh Agent Profile yang tidak menentukan model khusus.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              {/* Status Kunci API (dikelola di Pusat Kunci API) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs">
                <div className="flex items-start gap-2.5">
                  <KeyRound className="size-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">Kunci API OpenRouter (BYOK)</span>
                      <Badge variant={openrouterConfigured ? "default" : "outline"} className="text-[10px]">
                        {openrouterConfigured === null
                          ? "Memeriksa..."
                          : openrouterConfigured
                            ? "Kunci Tersimpan"
                            : "Belum Diatur"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Kunci API disimpan terenkripsi AES-256-GCM di server dan tidak pernah disimpan di browser.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-8 px-3 text-xs shrink-0 gap-1.5"
                >
                  <Link href="/settings/keys">
                    <span>Kelola Kunci API</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>

              {/* Select Default Global Model */}
              <FormField
                label="Model AI Global Seluruh Aplikasi"
                hint="Daftar model diambil secara dinamis dari endpoint OpenRouter (hanya model Tool-Ready yang mendukung tools call). Model ini otomatis digunakan di seluruh Lab Nodes, Lab Engine, Quick Writer, dan Batch Queue."
                tooltip="Model default aplikasi. Anda dapat mencari dan memilih dari ratusan model OpenRouter (GPT-4o, Claude 3.5, Gemini, DeepSeek, Llama, Qwen, dsb.). Sistem akan langsung merujuk ke pilihan global ini."
              >
                <OpenrouterModelPicker value={selectedModel} onChange={setSelectedModel} />
              </FormField>

              {/* Tingkat Penalaran (Reasoning Effort) */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground/90">
                      Tingkat Penalaran AI (Reasoning Effort)
                    </span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-border bg-muted/30">
                      {reasoningEffort}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Mengatur intensitas berpikir model reasoning (OpenAI o-series, Qwen Thinking, DeepSeek, dsb.).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {REASONING_EFFORT_OPTIONS.map((opt) => {
                    const isSelected = reasoningEffort === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setReasoningEffort(opt.value)}
                        className={`flex flex-col text-left p-3 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-2xs"
                            : "border-border/80 bg-background/50 hover:bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                            {opt.label}
                          </span>
                          {isSelected && <Check className="size-3.5 text-primary" />}
                        </div>
                        <span className="text-[11px] leading-relaxed">
                          {opt.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/15 text-xs text-destructive flex items-start gap-2.5">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-border/60 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  asChild
                  className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                >
                  <Link href="/settings" className="flex items-center gap-1.5">
                    <ArrowLeft className="size-3.5" />
                    <span>Kembali ke Pengaturan</span>
                  </Link>
                </Button>

                <div className="flex items-center gap-2">
                  {isSaved && (
                    <span className="text-xs text-success font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      <span>Tersimpan!</span>
                    </span>
                  )}
                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="h-9 px-5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shadow-2xs gap-1.5"
                  >
                    {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                    <span>Simpan Pengaturan</span>
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageContainer>
    </DashboardLayout>
  )
}
