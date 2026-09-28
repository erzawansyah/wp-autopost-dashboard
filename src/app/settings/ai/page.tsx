"use client"

import * as React from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { FormField } from "@/components/molecules/form-field"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import { OpenrouterModelPicker } from "@/components/molecules/openrouter-model-picker"
import {
  Bot,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  ArrowLeft,
} from "lucide-react"

import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"

export default function AiSettingsPage() {
  const [apiKey, setApiKey] = React.useState("")
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_AI_MODEL)
  const [isTesting, setIsTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{
    ok: boolean
    message: string
    label?: string
    usage?: number
  } | null>(null)
  const [isSaved, setIsSaved] = React.useState(false)

  React.useEffect(() => {
    // Muat API key dan model dari localStorage jika ada
    const handle = requestAnimationFrame(() => {
      const savedKey = localStorage.getItem("custom_openrouter_api_key") || ""
      const savedModel = localStorage.getItem("custom_openrouter_model") || DEFAULT_AI_MODEL
      if (savedKey) setApiKey(savedKey)
      if (savedModel) setSelectedModel(savedModel)
    })
    return () => cancelAnimationFrame(handle)
  }, [])

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setTestResult({
          ok: false,
          message: data.error || "Kunci API tidak valid atau ditolak oleh OpenRouter.",
        })
      } else {
        setTestResult({
          ok: true,
          message: data.message || "Koneksi berhasil!",
          label: data.label,
          usage: data.usage,
        })
      }
    } catch {
      setTestResult({
        ok: false,
        message: "Gagal menghubungi server untuk menguji kunci API.",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (apiKey.trim()) {
      localStorage.setItem("custom_openrouter_api_key", apiKey.trim())
    } else {
      localStorage.removeItem("custom_openrouter_api_key")
    }
    localStorage.setItem("custom_openrouter_model", selectedModel)

    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 3000)
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Title */}
        <PageHeader
          title="Pengaturan AI & Gateway OpenRouter"
          description="Konfigurasikan kunci API OpenRouter pribadi Anda (BYOK) dan pilih model default untuk pembuatan artikel otomatis."
          icon={Bot}
          backHref="/settings"
          backLabel="Kembali ke Pengaturan"
        />

        {/* Main Settings Card */}
        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="pb-4 border-b border-border/80">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <span>Kunci API OpenRouter (BYOK)</span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Masukkan kunci API OpenRouter Anda untuk menggunakan saldo dan kuota pribadi Anda secara langsung.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              {/* Form Input Key */}
              <FormField
                label="OpenRouter API Key"
                hint="Format: sk-or-v1-..."
                tooltip="Dapatkan kunci API Anda secara instan dari konsol OpenRouter di openrouter.ai/keys."
              >
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setTestResult(null)
                    }}
                    placeholder="Masukkan sk-or-v1-..."
                    className="h-9 text-xs flex-1 font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="h-9 px-3.5 text-xs shrink-0 cursor-pointer gap-1.5"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Menguji...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-3.5" />
                        <span>Uji Koneksi</span>
                      </>
                    )}
                  </Button>
                </div>
              </FormField>

              {/* Status Test Result */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    testResult.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                      : "bg-destructive/15 border-destructive/30 text-destructive"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold">{testResult.message}</p>
                    {testResult.label && (
                      <p className="text-[11px] opacity-80">
                        Label Key: {testResult.label}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Select Default Global Model */}
              <FormField
                label="Model AI Global Seluruh Aplikasi"
                hint="Daftar model diambil secara dinamis dari endpoint OpenRouter. Model ini otomatis digunakan di seluruh Lab Nodes, Lab Engine, Quick Writer, dan Batch Queue."
                tooltip="Model default aplikasi. Anda dapat mencari dan memilih dari ratusan model OpenRouter (GPT-4o, Claude 3.5, Gemini, DeepSeek, Llama, Qwen, dsb.). Sistem akan langsung merujuk ke pilihan global ini."
              >
                <OpenrouterModelPicker
                  value={selectedModel}
                  onChange={setSelectedModel}
                  apiKey={apiKey.trim() || undefined}
                />
              </FormField>

              {/* Info Box: Keamanan & Cara Mendapatkan Key */}
              <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>Keamanan &amp; Penyimpanan Kunci:</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Jika Anda tidak mengisi API Key di form ini, sistem akan otomatis menggunakan kunci cadangan dari environment server (<code>.env</code>). Kunci pribadi Anda tersimpan aman dan hanya digunakan saat generate artikel.
                </p>
                <div className="pt-1">
                  <Button
                    variant="link"
                    size="xs"
                    asChild
                    className="p-0 h-auto text-[11px] text-primary hover:underline gap-1"
                  >
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>Buka Halaman Kunci OpenRouter</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>
              </div>

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
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      <span>Tersimpan!</span>
                    </span>
                  )}
                  <Button
                    type="submit"
                    className="h-9 px-5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shadow-2xs"
                  >
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
