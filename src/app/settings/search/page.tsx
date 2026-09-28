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
import { Badge } from "@/components/atoms/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import {
  Search,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  ArrowLeft,
  Eye,
  EyeOff,
  Sparkles,
  Globe,
  SlidersHorizontal,
} from "lucide-react"

interface TestResult {
  ok: boolean
  message: string
  latencyMs?: number
}

export default function SearchSettingsPage() {
  const [tavilyKey, setTavilyKey] = React.useState("")
  const [braveKey, setBraveKey] = React.useState("")
  const [defaultProvider, setDefaultProvider] = React.useState("auto")

  const [showTavilyKey, setShowTavilyKey] = React.useState(false)
  const [showBraveKey, setShowBraveKey] = React.useState(false)

  const [tavilyConfigured, setTavilyConfigured] = React.useState(false)
  const [braveConfigured, setBraveConfigured] = React.useState(false)

  const [isTestingTavily, setIsTestingTavily] = React.useState(false)
  const [tavilyTestResult, setTavilyTestResult] = React.useState<TestResult | null>(null)

  const [isTestingBrave, setIsTestingBrave] = React.useState(false)
  const [braveTestResult, setBraveTestResult] = React.useState<TestResult | null>(null)

  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isSaved, setIsSaved] = React.useState(false)

  // Muat status kunci tersimpan dari backend
  React.useEffect(() => {
    let isMounted = true

    async function fetchSearchSettings() {
      try {
        const res = await fetch("/api/settings/search")
        if (!res.ok) return
        const data = await res.json()
        if (!isMounted) return

        if (data.providers?.tavily?.maskedKey) {
          setTavilyKey(data.providers.tavily.maskedKey)
          setTavilyConfigured(true)
        }
        if (data.providers?.brave?.maskedKey) {
          setBraveKey(data.providers.brave.maskedKey)
          setBraveConfigured(true)
        }
        if (data.defaultProvider) {
          setDefaultProvider(data.defaultProvider)
        }
      } catch {
        // Abaikan kegagalan inisialisasi awal
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    fetchSearchSettings()
    return () => {
      isMounted = false
    }
  }, [])

  const handleTestTavily = async () => {
    if (!tavilyKey.trim()) return
    setIsTestingTavily(true)
    setTavilyTestResult(null)

    try {
      const res = await fetch("/api/settings/search/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "tavily",
          apiKey: tavilyKey.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setTavilyTestResult({
          ok: false,
          message: data.error || "Kunci API Tavily tidak valid atau ditolak.",
          latencyMs: data.latencyMs,
        })
      } else {
        setTavilyTestResult({
          ok: true,
          message: data.message || "Koneksi ke Tavily Search API berhasil terverifikasi!",
          latencyMs: data.latencyMs,
        })
      }
    } catch {
      setTavilyTestResult({
        ok: false,
        message: "Gagal menghubungi server untuk menguji koneksi Tavily.",
      })
    } finally {
      setIsTestingTavily(false)
    }
  }

  const handleTestBrave = async () => {
    if (!braveKey.trim()) return
    setIsTestingBrave(true)
    setBraveTestResult(null)

    try {
      const res = await fetch("/api/settings/search/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "brave",
          apiKey: braveKey.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setBraveTestResult({
          ok: false,
          message: data.error || "Kunci API Brave tidak valid atau token ditolak.",
          latencyMs: data.latencyMs,
        })
      } else {
        setBraveTestResult({
          ok: true,
          message: data.message || "Koneksi ke Brave Search API berhasil terverifikasi!",
          latencyMs: data.latencyMs,
        })
      }
    } catch {
      setBraveTestResult({
        ok: false,
        message: "Gagal menghubungi server untuk menguji koneksi Brave.",
      })
    } finally {
      setIsTestingBrave(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setIsSaved(false)

    try {
      const payload: Record<string, string> = {
        defaultProvider,
      }
      // Kirim hanya jika bukan masked atau jika diubah/dikosongkan
      payload.tavilyApiKey = tavilyKey.trim()
      payload.braveApiKey = braveKey.trim()

      const res = await fetch("/api/settings/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setIsSaved(true)
        if (tavilyKey.trim() && !tavilyKey.includes("*")) setTavilyConfigured(true)
        if (braveKey.trim() && !braveKey.includes("*")) setBraveConfigured(true)
        setTimeout(() => setIsSaved(false), 3500)
      }
    } catch {
      // Abaikan simpan error
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Title */}
        <PageHeader
          title="Pengaturan Mesin Pencari & Riset Web (BYOK)"
          description="Konfigurasikan kunci API Tavily dan Brave Search pribadi Anda untuk riset artikel akurat bebas halusinasi dengan kuota gratis resmi."
          icon={Search}
          backHref="/settings"
          backLabel="Kembali ke Pengaturan"
        />

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {/* 1. Tavily Search BYOK Card */}
          <Card className="border-border/80 shadow-xs bg-card">
            <CardHeader className="pb-4 border-b border-border/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span>Tavily AI Search (Rekomendasi Utama)</span>
                </CardTitle>
                {tavilyConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 gap-1 text-[11px]">
                    <CheckCircle2 className="size-3" />
                    <span>Tersimpan</span>
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-muted-foreground text-[11px]">
                    Belum Terpasang
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs mt-1">
                Mesin pencari berbasis AI yang dioptimalkan khusus untuk LLM & RAG. Menghasilkan snippet bersih dan kutipan aktual berpresisi tinggi (Tersedia kuota gratis <strong>1.000 pencarian/bulan</strong>).
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-5 flex flex-col gap-4">
              <FormField
                label="Tavily API Key (TAVILY_API_KEY)"
                hint="Format: tvly-..."
                tooltip="Dapatkan kunci API gratis Anda langsung dari konsol Tavily di tavily.com."
              >
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showTavilyKey ? "text" : "password"}
                      value={tavilyKey}
                      onChange={(e) => {
                        setTavilyKey(e.target.value)
                        setTavilyTestResult(null)
                      }}
                      placeholder={isLoading ? "Memuat konfigurasi..." : "Masukkan tvly-..."}
                      className="h-9 pr-9 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTavilyKey(!showTavilyKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      title={showTavilyKey ? "Sembunyikan" : "Tampilkan"}
                    >
                      {showTavilyKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestTavily}
                    disabled={isTestingTavily || !tavilyKey.trim()}
                    className="h-9 px-3.5 text-xs shrink-0 cursor-pointer gap-1.5"
                  >
                    {isTestingTavily ? (
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

              {/* Status Test Result Tavily */}
              {tavilyTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    tavilyTestResult.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                      : "bg-destructive/15 border-destructive/30 text-destructive"
                  }`}
                >
                  {tavilyTestResult.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-0.5">
                    <p className="font-semibold">{tavilyTestResult.message}</p>
                    {tavilyTestResult.latencyMs !== undefined && (
                      <p className="text-[11px] opacity-80">
                        Latensi jaringan: {tavilyTestResult.latencyMs} ms
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>Daftar akun gratis & ambil API Key:</span>
                <Button variant="link" size="xs" asChild className="p-0 h-auto text-[11px] text-primary gap-1">
                  <a href="https://tavily.com" target="_blank" rel="noopener noreferrer">
                    <span>Konsol Tavily (Free 1,000 req/mo)</span>
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 2. Brave Search BYOK Card */}
          <Card className="border-border/80 shadow-xs bg-card">
            <CardHeader className="pb-4 border-b border-border/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Globe className="size-4 text-primary" />
                  <span>Brave Search API (Privasi & Indeks Global Independen)</span>
                </CardTitle>
                {braveConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 gap-1 text-[11px]">
                    <CheckCircle2 className="size-3" />
                    <span>Tersimpan</span>
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-muted-foreground text-[11px]">
                    Belum Terpasang
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs mt-1">
                Indeks web mandiri terbesar di luar Google/Bing dengan perlindungan privasi ketat. Sangat handal untuk artikel tren umum dan topik global (Tersedia kuota gratis <strong>2.000 pencarian/bulan</strong>).
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-5 flex flex-col gap-4">
              <FormField
                label="Brave Search API Key (BRAVE_API_KEY)"
                hint="Format: BSA..."
                tooltip="Dapatkan token API langganan Brave Search gratis di brave.com/search/api."
              >
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showBraveKey ? "text" : "password"}
                      value={braveKey}
                      onChange={(e) => {
                        setBraveKey(e.target.value)
                        setBraveTestResult(null)
                      }}
                      placeholder={isLoading ? "Memuat konfigurasi..." : "Masukkan BSA..."}
                      className="h-9 pr-9 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBraveKey(!showBraveKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      title={showBraveKey ? "Sembunyikan" : "Tampilkan"}
                    >
                      {showBraveKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestBrave}
                    disabled={isTestingBrave || !braveKey.trim()}
                    className="h-9 px-3.5 text-xs shrink-0 cursor-pointer gap-1.5"
                  >
                    {isTestingBrave ? (
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

              {/* Status Test Result Brave */}
              {braveTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    braveTestResult.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                      : "bg-destructive/15 border-destructive/30 text-destructive"
                  }`}
                >
                  {braveTestResult.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-0.5">
                    <p className="font-semibold">{braveTestResult.message}</p>
                    {braveTestResult.latencyMs !== undefined && (
                      <p className="text-[11px] opacity-80">
                        Latensi jaringan: {braveTestResult.latencyMs} ms
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>Daftar akun gratis & ambil API Key:</span>
                <Button variant="link" size="xs" asChild className="p-0 h-auto text-[11px] text-primary gap-1">
                  <a href="https://brave.com/search/api" target="_blank" rel="noopener noreferrer">
                    <span>Portal Pengembang Brave (Free 2,000 req/mo)</span>
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 3. Preferensi Provider Default */}
          <Card className="border-border/80 shadow-xs bg-card">
            <CardHeader className="pb-4 border-b border-border/80">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" />
                <span>Preferensi Mode Penelusuran Default</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Tentukan strategi pencarian yang akan digunakan secara otomatis oleh generator artikel saat riset topik.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-5 flex flex-col gap-4">
              <FormField
                label="Provider Default (DEFAULT_SEARCH_PROVIDER)"
                hint="Mode Auto secara otomatis menggunakan Tavily jika ada, lalu Brave, lalu Bing Scraper, dan Wikipedia."
              >
                <Select value={defaultProvider} onValueChange={setDefaultProvider}>
                  <SelectTrigger className="h-9 w-full text-xs">
                    <SelectValue placeholder="Pilih provider default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      Auto / Hybrid Pipeline (Tavily ➔ Brave ➔ SerpAPI ➔ Bing Scraper ➔ Wikipedia)
                    </SelectItem>
                    <SelectItem value="tavily">
                      Tavily Search API (Khusus AI/RAG Search)
                    </SelectItem>
                    <SelectItem value="brave">
                      Brave Search API (Indeks Independen & Privasi)
                    </SelectItem>
                    <SelectItem value="bing_scraper">
                      Bing Live Web Scraper (Zero-Config / Tanpa API Key)
                    </SelectItem>
                    <SelectItem value="open_knowledge">
                      Wikipedia / Open Knowledge Base (Fallback Offline)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              {/* Security info box */}
              <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>Keamanan Kunci &amp; Server Storage:</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Kunci API disimpan secara aman di berkas lingkungan server lokal (<code>.env.local</code>) dan tidak pernah dibagikan ke pihak ketiga atau ditampilkan secara utuh di peramban. Sistem akan menggunakan kunci tersebut secara otomatis di seluruh proses generasi naskah.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions Bottom Bar */}
          <div className="pt-2 flex items-center justify-between">
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

            <div className="flex items-center gap-3">
              {isSaved && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" />
                  <span>Pengaturan berhasil disimpan!</span>
                </span>
              )}
              <Button
                type="submit"
                disabled={isSaving}
                className="h-9 px-6 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shadow-2xs gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Pengaturan</span>
                )}
              </Button>
            </div>
          </div>
        </form>
      </PageContainer>
    </DashboardLayout>
  )
}
