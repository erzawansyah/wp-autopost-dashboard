"use client"

import * as React from "react"
import Link from "next/link"
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
  SlidersHorizontal,
  Info,
  Activity,
  Check,
} from "lucide-react"

import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { REASONING_EFFORT_OPTIONS, ReasoningEffort } from "@/lib/ai/reasoning"
import { SearchPreferences, UserSettingsResponse } from "@/types/settings"

type SearchProvider = NonNullable<SearchPreferences["default_provider"]>

/**
 * Seluruh provider yang didukung `webSearch()` beserta label Indonesia. Bertipe
 * `Record<SearchProvider, ...>` agar tsc gagal bila union provider berubah tanpa memperbarui daftar ini,
 * sehingga nilai tersimpan apa pun (mis. `searxng`, `serpapi`) selalu punya opsi di Select.
 */
const SEARCH_PROVIDER_LABELS: Record<SearchProvider, string> = {
  auto: "Auto Cascade (Utamakan Kunci API Pribadi ➔ Fallback Cerdas)",
  tavily: "Tavily Search (Gunakan API Key Pribadi)",
  brave: "Brave Search (Gunakan API Key Pribadi)",
  serpapi: "SerpAPI / Google (Butuh API Key SerpAPI Tersimpan)",
  searxng: "SearXNG (Metasearch Tanpa Kuota API)",
  bing_scraper: "Bing Web (Tanpa API Key, Cadangan Wikipedia)",
  open_knowledge: "Wikipedia / Basis Pengetahuan Terbuka (Tanpa API Key)",
}

const SEARCH_PROVIDER_OPTIONS = Object.entries(SEARCH_PROVIDER_LABELS) as [SearchProvider, string][]

function isSearchProvider(value: string): value is SearchProvider {
  return Object.hasOwn(SEARCH_PROVIDER_LABELS, value)
}

interface TestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export default function ApiKeysSettingsPage() {
  // Key inputs
  const [openrouterKey, setOpenrouterKey] = React.useState("")
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_AI_MODEL)
  const [reasoningEffort, setReasoningEffort] = React.useState<ReasoningEffort>("low")
  const [tavilyKey, setTavilyKey] = React.useState("")
  const [braveKey, setBraveKey] = React.useState("")
  const [pexafyKey, setPexafyKey] = React.useState("")
  const [langsmithKey, setLangsmithKey] = React.useState("")
  const [langsmithProject, setLangsmithProject] = React.useState("panitera")
  const [defaultSearchProvider, setDefaultSearchProvider] = React.useState<SearchProvider>("auto")

  // Visibility toggles
  const [showOpenrouter, setShowOpenrouter] = React.useState(false)
  const [showTavily, setShowTavily] = React.useState(false)
  const [showBrave, setShowBraveKey] = React.useState(false)
  const [showPexafy, setShowPexafy] = React.useState(false)
  const [showLangsmith, setShowLangsmith] = React.useState(false)

  // Status badges
  const [openrouterConfigured, setOpenrouterConfigured] = React.useState(false)
  const [tavilyConfigured, setTavilyConfigured] = React.useState(false)
  const [braveConfigured, setBraveConfigured] = React.useState(false)
  const [pexafyConfigured, setPexafyConfigured] = React.useState(false)
  const [langsmithConfigured, setLangsmithConfigured] = React.useState(false)

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
        if (data.keys?.langsmith?.configured) {
          setLangsmithKey("••••••••••••••••")
          setLangsmithConfigured(true)
        }
        if (data.langsmithProject) {
          setLangsmithProject(data.langsmithProject)
        }
        if (data.defaultAiModel) {
          setSelectedModel(data.defaultAiModel)
          if (typeof window !== "undefined") {
            localStorage.setItem("custom_openrouter_model", data.defaultAiModel)
          }
        }
        if (data.reasoningEffort) {
          setReasoningEffort(data.reasoningEffort)
        } else if (data.searchPreferences?.reasoning_effort) {
          setReasoningEffort(data.searchPreferences.reasoning_effort)
        }
        if (data.searchPreferences?.default_provider) {
          setDefaultSearchProvider(data.searchPreferences.default_provider)
        }
      }

      // Sync custom model from localStorage
      if (typeof window !== "undefined") {
        const localModel = localStorage.getItem("custom_openrouter_model")
        if (localModel && !data.defaultAiModel) setSelectedModel(localModel)
      }
    } catch (err) {
      console.error("Gagal memuat pengaturan kunci API:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // Migrasi sekali jalan: hapus kunci OpenRouter plaintext lama dari browser.
    // Kunci kini hanya disimpan terenkripsi di server via /api/settings/user.
    try {
      localStorage.removeItem("custom_openrouter_api_key")
    } catch {
      // localStorage tidak tersedia (mode privat / diblokir)
    }
  }, [])

  React.useEffect(() => {
    let ignore = false
    async function load() {
      if (!ignore) {
        await fetchSettings()
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [fetchSettings])

  // Test OpenRouter AI (via server: kunci yang baru diketik, atau kunci tersimpan jika tersamar)
  const handleTestAi = async () => {
    const unsavedKey = openrouterKey.includes("•") ? "" : openrouterKey.trim()
    setIsTestingAi(true)
    setAiTestResult(null)
    const startTime = Date.now()

    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unsavedKey ? { apiKey: unsavedKey } : {}),
      })
      const latencyMs = Date.now() - startTime
      const data = await res.json().catch(() => null)

      if (res.ok && data?.ok) {
        const remaining =
          typeof data.limit === "number" && typeof data.usage === "number"
            ? data.limit - data.usage
            : null
        setAiTestResult({
          ok: true,
          message:
            remaining !== null
              ? `Koneksi OpenRouter terverifikasi! Kuota tersisa: $${remaining.toFixed(2)}`
              : "Koneksi OpenRouter terverifikasi!",
          latencyMs,
        })
      } else {
        setAiTestResult({
          ok: false,
          message: data?.error || "Kunci API OpenRouter tidak valid atau ditolak.",
          latencyMs,
        })
      }
    } catch {
      setAiTestResult({
        ok: false,
        message: "Gagal menghubungi server untuk menguji kunci OpenRouter.",
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
      // Hanya field yang punya input di halaman ini yang dikirim. Field lain (mis. `searxngUrl`)
      // sengaja tidak disertakan: PUT hanya memperbarui field yang ada di body, sehingga nilai
      // tersimpan lama tidak divalidasi ulang dan tidak bisa memblokir penyimpanan kunci API.
      const payload: Record<string, unknown> = {
        defaultAiModel: selectedModel,
        reasoningEffort,
        searchPreferences: {
          default_provider: defaultSearchProvider,
          default_ai_model: selectedModel,
          reasoning_effort: reasoningEffort,
        },
      }

      // Process openrouter
      if (openrouterKey.trim() && !openrouterKey.includes("•")) {
        payload.openrouterKey = openrouterKey.trim()
      } else if (openrouterKey.trim() === "") {
        payload.openrouterKey = ""
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

      // Process langsmith
      if (langsmithKey.trim() && !langsmithKey.includes("•")) {
        payload.langsmithApiKey = langsmithKey.trim()
      } else if (langsmithKey.trim() === "") {
        payload.langsmithApiKey = ""
      }
      payload.langsmithProject = langsmithProject.trim() || "panitera"

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
      <PageContainer size="default">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="mt-3 text-xs text-muted-foreground">Memuat pusat konfigurasi kunci API...</p>
        </div>
      </PageContainer>
    )
  }

  return (
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
                  {openrouterConfigured ? "Kunci Tersimpan" : "Belum Diatur"}
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
                unsavedKey={openrouterKey.includes("•") ? undefined : openrouterKey}
                className="w-full"
              />
            </div>

            {/* Tingkat Penalaran (Reasoning Effort) */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-semibold text-foreground/90">
                    Tingkat Penalaran (Reasoning Effort)
                  </Label>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {reasoningEffort}
                  </Badge>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Mengatur kedalaman &amp; budget penalaran (thinking tokens) untuk model penalaran seperti DeepSeek R1, Qwen Thinking, dan OpenAI o-series.
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
              <Select
                value={defaultSearchProvider}
                onValueChange={(value) => {
                  if (isSearchProvider(value)) setDefaultSearchProvider(value)
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Pilih Provider Default" />
                </SelectTrigger>
                <SelectContent>
                  {SEARCH_PROVIDER_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
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

        {/* SECTION 4: Observability & LangSmith Tracing */}
        <Card className="border-border/80 bg-card/90 shadow-2xs">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="size-4 text-primary" />
                4. Observabilitas &amp; Tracing Agen (LangSmith)
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Badge variant={langsmithConfigured ? "default" : "outline"} className="text-[10px]">
                  {langsmithConfigured ? "LangSmith Aktif" : "Opsional (Tracing)"}
                </Badge>
                <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1">
                  <a href="https://smith.langchain.com" target="_blank" rel="noopener noreferrer">
                    <span>Buka LangSmith</span>
                    <ExternalLink className="size-2.5" />
                  </a>
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              Pantau setiap langkah ReAct agent, pemanggilan tools, penalaran model (reasoning tokens), dan grafik eksekusi DeepAgents secara real-time di dasbor LangSmith.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-1.5 rounded-lg border border-border/70 p-3.5 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">LangSmith API Key</span>
                  {langsmithConfigured && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Tersimpan di database / env
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">Format: lsv2_pt_...</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Masukkan API Key dari akun LangSmith Anda. Trace hanya dikirim ke proyek LangSmith milik akun Anda sendiri.
              </p>
              <div className="relative pt-1">
                <Input
                  type={showLangsmith ? "text" : "password"}
                  value={langsmithKey}
                  onChange={(e) => setLangsmithKey(e.target.value)}
                  placeholder="lsv2_pt_..."
                  className="font-mono text-xs pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowLangsmith(!showLangsmith)}
                  className="absolute right-2.5 top-[13px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {showLangsmith ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* LangSmith Project Name */}
            <div className="space-y-1.5 rounded-lg border border-border/70 p-3.5 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Nama Proyek LangSmith (Project Name)</span>
                <span className="text-[10px] text-muted-foreground">Default: panitera</span>
              </div>
              <Input
                type="text"
                value={langsmithProject}
                onChange={(e) => setLangsmithProject(e.target.value)}
                placeholder="panitera"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Semua run Standard Agent dan DeepAgents akan otomatis dikelompokkan ke dalam proyek ini di akun LangSmith Anda.
              </p>
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
  )
}
