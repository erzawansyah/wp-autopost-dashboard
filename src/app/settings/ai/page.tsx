"use client"

import * as React from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { FormField } from "@/components/molecules/form-field"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import {
  Bot,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  ArrowLeft,
} from "lucide-react"

const POPULAR_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)", provider: "OpenRouter" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)", provider: "Google" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Kualitas Editorial Tertinggi)", provider: "Anthropic" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta" },
]

export default function AiSettingsPage() {
  const [apiKey, setApiKey] = React.useState("")
  const [selectedModel, setSelectedModel] = React.useState("openai/gpt-oss-120b")
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
    const savedKey = localStorage.getItem("custom_openrouter_api_key") || ""
    const savedModel = localStorage.getItem("custom_openrouter_model") || "openai/gpt-oss-120b"
    if (savedKey) setApiKey(savedKey)
    if (savedModel) setSelectedModel(savedModel)
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
      <div className="flex flex-col gap-6">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Bot className="size-5 text-accent" />
              <span>Pengaturan AI &amp; Gateway OpenRouter</span>
              <HelpTooltip content="Platform ini terhubung ke OpenRouter SDK yang mendukung ratusan model AI mutakhir (Claude, GPT, Gemini, Llama, DeepSeek) via satu gateway." />
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Konfigurasikan kunci API OpenRouter pribadi Anda (BYOK) dan pilih model default untuk pembuatan artikel otomatis.
            </p>
          </div>
        </div>

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

              {/* Select Default Model */}
              <FormField
                label="Model AI Default"
                hint="Model ini akan digunakan sebagai mesin utama pembuatan artikel anti-slop"
                tooltip="Anda dapat memilih model sesuai kebutuhan: GPT-OSS untuk kecepatan & efisiensi biaya, Claude untuk kualitas narasi tinggi, atau Gemini untuk riset mendalam."
              >
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="h-9 w-full text-xs">
                    <SelectValue placeholder="Pilih model AI" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)]">
                    {POPULAR_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span>{m.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <Link href="/" className="flex items-center gap-1.5">
                    <ArrowLeft className="size-3.5" />
                    <span>Kembali ke Dashboard</span>
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
      </div>
    </DashboardLayout>
  )
}
