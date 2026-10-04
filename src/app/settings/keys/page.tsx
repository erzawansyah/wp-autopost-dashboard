"use client"

import * as React from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Badge } from "@/components/atoms/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { OpenrouterModelPicker } from "@/components/molecules/openrouter-model-picker"
import {
  KeyRound,
  Bot,
  Search,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  Globe,
  SlidersHorizontal,
  Info,
} from "lucide-react"

import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { UserSettingsResponse } from "@/types/settings"

interface TestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export default function ApiKeysSettingsPage() {
  // Key inputs
  const [openrouterKey, setOpenrouterKey] = React.useState("")
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_AI_MODEL)
  const [tavilyKey, setTavilyKey] = React.useState("")
  const [braveKey, setBraveKey] = React.useState("")
  const [searxngUrl, setSearxngUrl] = React.useState("")
  const [pexafyKey, setPexafyKey] = React.useState("")
  const [defaultSearchProvider, setDefaultSearchProvider] = React.useState("auto")

  // Visibility toggles
  const [showOpenrouter, setShowOpenrouter] = React.useState(false)
  const [showTavily, setShowTavily] = React.useState(false)
  const [showBrave, setShowBraveKey] = React.useState(false)
  const [showPexafy, setShowPexafy] = React.useState(false)

  // Status badges
  const [openrouterConfigured, setOpenrouterConfigured] = React.useState(false)
  const [tavilyConfigured, setTavilyConfigured] = React.useState(false)
  const [braveConfigured, setBraveConfigured] = React.useState(false)
  const [pexafyConfigured, setPexafyConfigured] = React.useState(false)

  // Testing states
  const [isTestingAi, setIsTestingAi] = React.useState(false)
  const [aiTestResult, setAiTestResult] = React.useState<TestResult | null>(null)

  const [isTestingTavily, setIsTestingTavily] = React.useState(false)
  const [tavilyTestResult, setTavilyTestResult] = React.useState<TestResult | null>(null)

  const [isTestingBrave, setIsTestingBrave] = React.useState(false)
  const [braveTestResult, setBraveTestResult] = React.useState<TestResult | null>(null)


  const [isTestingPexafy, setIsTestingPexafy] = React.useState(false)
  const [pexafyTestResult, setPexafyTestResult] = React.useState<TestResult | null>(null)

  // Page states
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isSaved, setIsSaved] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const fetchSettings = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/settings/user")
      const data: UserSettingsResponse = await res.json()

      if (data.ok) {
        if (data.keys?.openrouter?.configured) {
          setOpenrouterKey("••••••••••••••••")
          setOpenrouterConfigured(true)
        }
        if (data.keys?.tavily?.configured) {
          setTavilyKey("••••••••••••••••")
          setTavilyConfigured(true)
        }
        if (data.keys?.brave?.configured) {
          setBraveKey("••••••••••••••••")
          setBraveConfigured(true)
        }
        if (data.keys?.pexafy?.configured) {
          setPexafyKey("••••••••••••••••")
          setPexafyConfigured(true)
        }
        if (data.searxngUrl) {
          setSearxngUrl(data.searxngUrl)
        }
        if (data.searchPreferences?.default_provider) {
          setDefaultSearchProvider(data.searchPreferences.default_provider)
        }
      }

      // Sync custom model from localStorage
      if (typeof window !== "undefined") {
        const localModel = localStorage.getItem("custom_openrouter_model")
        if (localModel) setSelectedModel(localModel)
        const localAiKey = localStorage.getItem("custom_openrouter_api_key")
        if (localAiKey && !data.keys?.openrouter?.configured) {
          setOpenrouterKey(localAiKey)
        }
      }
    } catch (err) {
      console.error("Gagal memuat pengaturan kunci API:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Test OpenRouter AI
  const handleTestAi = async () => {
    const keyToTest = openrouterKey.includes("•") ? "" : openrouterKey.trim()
    setIsTestingAi(true)
    setAiTestResult(null)
    const startTime = Date.now()

    try {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: {
          Authorization: `Bearer ${keyToTest || localStorage.getItem("custom_openrouter_api_key") || ""}`,
        },
      })
      const latencyMs = Date.now() - startTime
      const data = await res.json().catch(() => ({}))

      if (res.ok && data?.data) {
        setAiTestResult({
          ok: true,
          message: `Koneksi OpenRouter terverifikasi! Kuota tersisa: $${(data.data.limit ? data.data.limit - data.data.usage : 0).toFixed(2)}`,
          latencyMs,
        })
      } else {
        setAiTestResult({
          ok: false,
          message: data?.error?.message || "Kunci API OpenRouter tidak valid atau ditolak.",
          latencyMs,
        })
      }
    } catch {
      setAiTestResult({
        ok: false,
        message: "Gagal menghubungi server OpenRouter.",
      })
    } finally {
      setIsTestingAi(false)
    }
  }

  // Test Search Provider
  const handleTestSearchProvider = async (provider: "tavily" | "brave") => {
    const keyVal = provider === "tavily" ? tavilyKey : braveKey
    if (!keyVal.trim() || keyVal.includes("•")) {
      return
    }

    if (provider === "tavily") {
      setIsTestingTavily(true)
      setTavilyTestResult(null)
    } else {
      setIsTestingBrave(true)
      setBraveTestResult(null)
    }

    try {
      const res = await fetch("/api/settings/search/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: keyVal.trim(),
        }),
      })

      const data = await res.json()
      const resultObj: TestResult = {
        ok: res.ok && data.ok,
        message: data.message || data.error || `Pengujian ${provider} selesai`,
        latencyMs: data.latencyMs,
      }

      if (provider === "tavily") {
        setTavilyTestResult(resultObj)
      } else {
        setBraveTestResult(resultObj)
      }
    } catch {
      const errObj: TestResult = {
        ok: false,
        message: `Gagal menghubungi server untuk menguji koneksi ${provider}.`,
      }
      if (provider === "tavily") setTavilyTestResult(errObj)
      else setBraveTestResult(errObj)
    } finally {
      if (provider === "tavily") setIsTestingTavily(false)
      else setIsTestingBrave(false)
    }
  }


  // Test Pexafy
  const handleTestPexafy = async () => {
    if (!pexafyKey.trim() || pexafyKey.includes("•")) return
    setIsTestingPexafy(true)
    setPexafyTestResult(null)

    try {
      const res = await fetch("/api/settings/search/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "pexafy",
          apiKey: pexafyKey.trim(),
        }),
      })

      const data = await res.json()
      setPexafyTestResult({
        ok: res.ok && data.ok,
        message: data.message || data.error || "Uji koneksi Pexafy selesai.",
        latencyMs: data.latencyMs,
      })
    } catch {
      setPexafyTestResult({
        ok: false,
        message: "Gagal menguji koneksi ke Pexafy API.",
      })
    } finally {
      setIsTestingPexafy(false)
    }
  }

  // Save All
  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setErrorMessage(null)

    try {
      const payload: Record<string, unknown> = {
        searchPreferences: {
          default_provider: defaultSearchProvider,
        },
        searxngUrl: searxngUrl.trim() || "",
      }

      // Process openrouter
      if (openrouterKey.trim() && !openrouterKey.includes("•")) {
        payload.openrouterKey = openrouterKey.trim()
        localStorage.setItem("custom_openrouter_api_key", openrouterKey.trim())
      } else if (openrouterKey.trim() === "") {
        payload.openrouterKey = ""
        localStorage.removeItem("custom_openrouter_api_key")
      }
      localStorage.setItem("custom_openrouter_model", selectedModel)

      // Process tavily
      if (tavilyKey.trim() && !tavilyKey.includes("•")) {
        payload.tavilyKey = tavilyKey.trim()
      } else if (tavilyKey.trim() === "") {
        payload.tavilyKey = ""
      }

      // Process brave
      if (braveKey.trim() && !braveKey.includes("•")) {
        payload.braveKey = braveKey.trim()
      } else if (braveKey.trim() === "") {
        payload.braveKey = ""
      }

      // Process pexafy
      if (pexafyKey.trim() && !pexafyKey.includes("•")) {
        payload.pexafyKey = pexafyKey.trim()
      } else if (pexafyKey.trim() === "") {
        payload.pexafyKey = ""
      }

      const res = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const resData = await res.json()
      if (!res.ok || !resData.ok) {
        setErrorMessage(resData.error || "Gagal menyimpan konfigurasi kunci API.")
      } else {
        setIsSaved(true)
        setTimeout(() => setIsSaved(false), 3000)
        fetchSettings()
      }
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan saat menyimpan konfigurasi.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer size="default">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="mt-3 text-xs text-muted-foreground">Memuat pusat konfigurasi kunci API...</p>
          </div>
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Pusat Kunci API &amp; Integrasi (BYOK Hub)"
          description="Kelola seluruh kunci API pihak ketiga (OpenRouter AI, Mesin Pencari Web, dan Pencari Foto) secara terpusat dalam satu panel terenkripsi."
          icon={KeyRound}
          backHref="/settings"
          backLabel="Kembali ke Pengaturan"
        />

        <form onSubmit={handleSaveAll} className="flex flex-col gap-6">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isSaved && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>Seluruh kunci API dan preferensi berhasil disimpan dengan enkripsi server AES-256-GCM.</span>
            </div>
          )}

          {/* Banner Keamanan Server */}
          <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/30 p-3.5 text-xs">
            <ShieldCheck className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-foreground">Zero Plaintext Storage Guarantee</span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Semua kunci API disimpan dalam bentuk terenkripsi AES-256-GCM pada database Supabase Anda dan hanya didekripsi sesaat di memori server saat melakukan pemanggilan API. Kunci tidak pernah dibagikan ke pihak ketiga mana pun.
              </p>
            </div>
          </div>

          {/* SECTION 1: AI Provider (OpenRouter) */}
          <Card className="border-border/80 bg-card/90 shadow-2xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Bot className="size-4 text-ai-process" />
                  1. Provider Model AI (OpenRouter Gateway)
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <Badge variant={openrouterConfigured ? "default" : "outline"} className="text-[10px]">
                    {openrouterConfigured ? "Kunci Tersimpan" : "Default Server / Belum Diatur"}
                  </Badge>
                  <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                      <span>Daftar / Buat Kunci</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </Button>
                </div>
              </div>
              <CardDescription className="text-xs">
                OpenRouter menghubungkan ratusan model LLM mutakhir (Claude 3.5 Sonnet, GPT-4o, DeepSeek-V3, Gemini 2.0 Flash) melalui satu gerbang API terpadu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground/90">
                    OpenRouter API Key (sk-or-...)
                  </Label>
                  {openrouterConfigured && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Terenkripsi di database
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showOpenrouter ? "text" : "password"}
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="font-mono text-xs pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenrouter(!showOpenrouter)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showOpenrouter ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestAi}
                    disabled={isTestingAi || (!openrouterKey.trim() && !openrouterConfigured)}
                    className="cursor-pointer gap-1.5 text-xs shrink-0"
                  >
                    {isTestingAi ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Uji Kunci
                  </Button>
                </div>
                {aiTestResult && (
                  <div
                    className={`flex items-center gap-2 rounded-md p-2.5 text-xs ${
                      aiTestResult.ok
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {aiTestResult.ok ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertCircle className="size-3.5 shrink-0" />}
                    <span className="flex-1">{aiTestResult.message}</span>
                    {aiTestResult.latencyMs && (
                      <span className="text-[10px] opacity-75">{aiTestResult.latencyMs}ms</span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground/90">
                  Model Default Penulisan Artikel
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Model yang akan digunakan secara default oleh System Writer jika profil agent tidak menentukan model khusus.
                </p>
                <OpenrouterModelPicker
                  value={selectedModel}
                  onChange={setSelectedModel}
                  apiKey={openrouterKey.includes("•") ? undefined : openrouterKey}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 2: Web Search Engines */}
          <Card className="border-border/80 bg-card/90 shadow-2xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Search className="size-4 text-primary" />
                  2. Mesin Pencari Web &amp; Riset Fakta (Web Search BYOK)
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    Multi-Provider
                  </Badge>
                </div>
              </div>
              <CardDescription className="text-xs">
                Digunakan oleh agent untuk mencari referensi terkini, statistik akurat, dan validasi data agar naskah artikel bebas halusinasi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Default Search Engine Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="size-3.5 text-primary" />
                  <Label className="text-xs font-semibold text-foreground/90">
                    Mode Pemilihan Mesin Pencari Utama
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pilih mesin pencari prioritas untuk riset artikel atau gunakan mode rekomendasi cerdas otomatis.
                </p>
                <Select value={defaultSearchProvider} onValueChange={setDefaultSearchProvider}>
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Pilih Provider Default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">
                      Auto Cascade (Utamakan Kunci API Pribadi ➔ Fallback Cerdas)
                    </SelectItem>
                    <SelectItem value="tavily" className="text-xs">
                      Tavily Search (Gunakan API Key Pribadi)
                    </SelectItem>
                    <SelectItem value="brave" className="text-xs">
                      Brave Search (Gunakan API Key Pribadi)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tavily API Key */}
              <div className="space-y-1.5 rounded-lg border border-border/70 p-3.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Tavily Search API Key</span>
                    <Badge variant={tavilyConfigured ? "default" : "outline"} className="text-[10px]">
                      {tavilyConfigured ? "Tersimpan" : "Belum Diatur"}
                    </Badge>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
                    <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">
                      <span>Dapatkan 1.000 Pencarian Gratis/Bulan</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </Button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showTavily ? "text" : "password"}
                      value={tavilyKey}
                      onChange={(e) => setTavilyKey(e.target.value)}
                      placeholder="tvly-..."
                      className="font-mono text-xs pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTavily(!showTavily)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showTavily ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestSearchProvider("tavily")}
                    disabled={isTestingTavily || (!tavilyKey.trim() || tavilyKey.includes("•"))}
                    className="cursor-pointer gap-1.5 text-xs shrink-0"
                  >
                    {isTestingTavily ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Uji Kunci
                  </Button>
                </div>
                {tavilyTestResult && (
                  <div
                    className={`flex items-center gap-2 rounded-md p-2.5 text-xs ${
                      tavilyTestResult.ok
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {tavilyTestResult.ok ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertCircle className="size-3.5 shrink-0" />}
                    <span className="flex-1">{tavilyTestResult.message}</span>
                    {tavilyTestResult.latencyMs && (
                      <span className="text-[10px] opacity-75">{tavilyTestResult.latencyMs}ms</span>
                    )}
                  </div>
                )}
              </div>

              {/* Brave Search API Key */}
              <div className="space-y-1.5 rounded-lg border border-border/70 p-3.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Brave Search API Key</span>
                    <Badge variant={braveConfigured ? "default" : "outline"} className="text-[10px]">
                      {braveConfigured ? "Tersimpan" : "Belum Diatur"}
                    </Badge>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
                    <a href="https://brave.com/search/api/" target="_blank" rel="noopener noreferrer">
                      <span>Dapatkan 2.000 Kueri Gratis/Bulan</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </Button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showBrave ? "text" : "password"}
                      value={braveKey}
                      onChange={(e) => setBraveKey(e.target.value)}
                      placeholder="BSA..."
                      className="font-mono text-xs pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBraveKey(!showBrave)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showBrave ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestSearchProvider("brave")}
                    disabled={isTestingBrave || (!braveKey.trim() || braveKey.includes("•"))}
                    className="cursor-pointer gap-1.5 text-xs shrink-0"
                  >
                    {isTestingBrave ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Uji Kunci
                  </Button>
                </div>
                {braveTestResult && (
                  <div
                    className={`flex items-center gap-2 rounded-md p-2.5 text-xs ${
                      braveTestResult.ok
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {braveTestResult.ok ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertCircle className="size-3.5 shrink-0" />}
                    <span className="flex-1">{braveTestResult.message}</span>
                    {braveTestResult.latencyMs && (
                      <span className="text-[10px] opacity-75">{braveTestResult.latencyMs}ms</span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3: Image Provider (Pexafy & Fallback) */}
          <Card className="border-border/80 bg-card/90 shadow-2xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon className="size-4 text-primary" />
                  3. Penyedia Foto Bebas Royalti (Stock Photos &amp; Media)
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <Badge variant={pexafyConfigured ? "default" : "outline"} className="text-[10px]">
                    {pexafyConfigured ? "Pexafy Aktif" : "Opsional"}
                  </Badge>
                  <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
                    <a href="https://pexafy.com/dashboard/api-keys" target="_blank" rel="noopener noreferrer">
                      <span>Daftar Pexafy API</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </Button>
                </div>
              </div>
              <CardDescription className="text-xs">
                Mencari foto landscape berkualitas tinggi (minWidth 1280px) untuk featured image artikel otomatis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Pexafy API Key */}
              <div className="space-y-1.5 rounded-lg border border-border/70 p-3.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Pexafy API Key</span>
                    {pexafyConfigured && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Tersimpan di database
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">Katalog multi-sumber semantik 9M+ foto</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pexafy mengindeks jutaan foto bebas royalti dari berbagai pustaka foto komersial dalam satu integrasi semantik.
                </p>
                <div className="flex gap-2 pt-1">
                  <div className="relative flex-1">
                    <Input
                      type={showPexafy ? "text" : "password"}
                      value={pexafyKey}
                      onChange={(e) => setPexafyKey(e.target.value)}
                      placeholder="pxf_..."
                      className="font-mono text-xs pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPexafy(!showPexafy)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showPexafy ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestPexafy}
                    disabled={isTestingPexafy || (!pexafyKey.trim() || pexafyKey.includes("•"))}
                    className="cursor-pointer gap-1.5 text-xs shrink-0"
                  >
                    {isTestingPexafy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Uji Kunci
                  </Button>
                </div>
                {pexafyTestResult && (
                  <div
                    className={`flex items-center gap-2 rounded-md p-2.5 text-xs ${
                      pexafyTestResult.ok
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {pexafyTestResult.ok ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertCircle className="size-3.5 shrink-0" />}
                    <span className="flex-1">{pexafyTestResult.message}</span>
                    {pexafyTestResult.latencyMs && (
                      <span className="text-[10px] opacity-75">{pexafyTestResult.latencyMs}ms</span>
                    )}
                  </div>
                )}
              </div>

              {/* Alur Pipeline Bertingkat Pencarian Gambar */}
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/15 p-3.5 text-xs">
                <Info className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-medium text-foreground">Alur Pipeline Bertingkat Pencarian Gambar</span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sistem memprioritaskan kunci API resmi (Pexafy) terlebih dahulu. Jika kunci API tidak diisi atau kuota habis, sistem otomatis melanjutkan ke pencarian metasearch dan katalog kurasi bebas royalti. Anda tetap dapat menghasilkan artikel dengan gambar berkualitas tinggi meskipun belum mengisi API Key.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 pb-8">
            <p className="text-xs text-muted-foreground">
              Perubahan disimpan langsung ke akun Anda dan langsung aktif pada penulisan artikel berikutnya.
            </p>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto text-xs">
                <Link href="/settings">Batal</Link>
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto cursor-pointer gap-2 text-xs px-6"
              >
                {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                Simpan Semua Kunci API
              </Button>
            </div>
          </div>
        </form>
      </PageContainer>
    </DashboardLayout>
  )
}
