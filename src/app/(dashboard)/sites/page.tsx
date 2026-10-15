"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { generateAutoWpAppName } from "@/lib/wordpress/app-name"
import { Card, CardContent, CardHeader, CardDescription } from "@/components/atoms/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/atoms/table"
import { Badge } from "@/components/atoms/badge"
import { EmptyState } from "@/components/molecules/empty-state"
import { FormField } from "@/components/molecules/form-field"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react"

interface WpSite {
  id: string
  site_name: string
  base_url: string
  wp_username: string
  status: string
  last_checked_at: string | null
  created_at: string
}

function SitesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [sites, setSites] = React.useState<WpSite[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [showAddForm, setShowAddForm] = React.useState(false)

  // Mode sambungan: "auto" (Connect Otomatis via authorize-application.php) atau "manual" (Application Password)
  const [authMode, setAuthMode] = React.useState<"auto" | "manual">("auto")

  // Form state
  const [siteName, setSiteName] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [appPassword, setAppPassword] = React.useState("")
  const [currentUserEmail, setCurrentUserEmail] = React.useState("")

  // Status aksi
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [isTesting, setIsTesting] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [actionMessage, setActionMessage] = React.useState<string | null>(null)
  const [dismissedBanner, setDismissedBanner] = React.useState(false)

  // Membaca status query params secara deklaratif tanpa memicu cascading renders
  const authStatus = searchParams.get("auth_status")
  const siteParam = searchParams.get("site_name")
  const errorParam = searchParams.get("error")

  const queryBanner = React.useMemo(() => {
    if (!authStatus) return null
    if (authStatus === "connected") {
      const decodedName = siteParam ? decodeURIComponent(siteParam) : "WordPress"
      return { type: "success" as const, text: `Website '${decodedName}' berhasil tersambung secara otomatis!` }
    }
    if (authStatus === "rejected") {
      return { type: "error" as const, text: "Otorisasi koneksi dibatalkan di halaman WordPress." }
    }
    if (authStatus === "validation_failed") {
      const errText = errorParam ? decodeURIComponent(errorParam) : "Kredensial dari WordPress gagal divalidasi."
      return { type: "error" as const, text: `Gagal menyambungkan: ${errText}` }
    }
    if (authStatus === "invalid_or_expired_state") {
      return { type: "error" as const, text: "Sesi otorisasi kedaluwarsa atau token tidak valid. Silakan coba kembali." }
    }
    if (authStatus === "missing_credentials") {
      return { type: "error" as const, text: "WordPress tidak mengirimkan kredensial otorisasi yang lengkap." }
    }
    if (authStatus === "session_mismatch") {
      return { type: "error" as const, text: "Otorisasi ini dimulai dari akun Panitera lain. Masuk dengan akun yang benar lalu hubungkan ulang website." }
    }
    if (authStatus === "session_required") {
      return { type: "error" as const, text: "Sesi login Anda berakhir sebelum otorisasi selesai. Masuk kembali lalu hubungkan ulang website." }
    }
    if (authStatus === "save_failed" || authStatus === "server_config_error") {
      return { type: "error" as const, text: "Kredensial valid, tetapi website gagal disimpan. Silakan coba lagi beberapa saat lagi." }
    }
    return null
  }, [authStatus, siteParam, errorParam])

  const effectiveActionMessage = !dismissedBanner && queryBanner?.type === "success" ? queryBanner.text : actionMessage
  const effectiveFormError = !dismissedBanner && queryBanner?.type === "error" ? queryBanner.text : formError

  // Bersihkan query string dari browser history
  React.useEffect(() => {
    if (authStatus) {
      router.replace("/sites")
    }
  }, [authStatus, router])

  // Ambil daftar website dari backend
  const fetchSites = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/sites")
      if (res.status === 401) {
        router.push("/login")
        return
      }
      const data = await res.json()
      if (data.sites) {
        setSites(data.sites)
      }
    } catch (err) {
      console.error("Gagal memuat daftar situs:", err)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  React.useEffect(() => {
    let isMounted = true

    const loadInitialSites = async () => {
      try {
        fetch("/api/auth/me")
          .then((r) => r.json())
          .then((data) => {
            if (data.user?.email && isMounted) {
              setCurrentUserEmail(data.user.email)
            }
          })
          .catch(() => {})

        const res = await fetch("/api/sites")
        if (!isMounted) return
        if (res.status === 401) {
          router.push("/login")
          return
        }
        const data = await res.json()
        if (data.sites) {
          setSites(data.sites)
        }
      } catch (err) {
        console.error("Gagal memuat situs:", err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadInitialSites()

    return () => {
      isMounted = false
    }
  }, [router])

  // 1. Alur Sambung Otomatis (Connect ke WordPress)
  const handleAutoConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!baseUrl.trim()) {
      setFormError("Alamat website (URL) WordPress harus diisi.")
      return
    }

    setIsConnecting(true)

    try {
      const res = await fetch("/api/sites/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          siteName: siteName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFormError(data.error || "Gagal menyiapkan koneksi ke WordPress.")
        setIsConnecting(false)
        return
      }

      if (data.authorizeUrl) {
        // Alihkan browser ke halaman otorisasi resmi WordPress
        window.location.href = data.authorizeUrl
      } else {
        setFormError("URL otorisasi WordPress tidak ditemukan.")
        setIsConnecting(false)
      }
    } catch {
      setFormError("Gangguan koneksi internet saat menghubungi WordPress.")
      setIsConnecting(false)
    }
  }

  // 2. Alur Pengujian Koneksi Manual (Fallback)
  const handleTestConnection = async () => {
    if (!baseUrl || !username || !appPassword) {
      setTestResult({
        ok: false,
        message: "Lengkapi alamat web, username, dan Application Password dulu.",
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await fetch("/api/sites/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: baseUrl,
          wp_username: username,
          app_password: appPassword,
        }),
      })

      const data = await res.json()
      if (res.ok && data.ok) {
        setTestResult({ ok: true, message: data.message })
      } else {
        setTestResult({ ok: false, message: data.error || "Gagal menghubungi blog WordPress." })
      }
    } catch {
      setTestResult({ ok: false, message: "Terjadi gangguan jaringan saat pengujian." })
    } finally {
      setIsTesting(false)
    }
  }

  // 3. Simpan Manual (Fallback)
  const handleSaveManualSite = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!siteName.trim() || !baseUrl.trim() || !username.trim() || !appPassword.trim()) {
      setFormError("Semua kolom harus diisi.")
      return
    }

    setIsSaving(true)

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_name: siteName,
          base_url: baseUrl,
          wp_username: username,
          app_password: appPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setFormError(data.error || "Gagal menyimpan website.")
        return
      }

      setActionMessage(`Website '${siteName}' berhasil disambungkan.`)
      setShowAddForm(false)
      setSiteName("")
      setBaseUrl("")
      setUsername("")
      setAppPassword("")
      setTestResult(null)
      fetchSites()
    } catch {
      setFormError("Gagal menyimpan website karena gangguan jaringan.")
    } finally {
      setIsSaving(false)
    }
  }

  // Hapus website
  const handleDeleteSite = async (id: string, name: string) => {
    if (!confirm(`Hapus website '${name}'? Antrean pos yang tersambung ke web ini juga akan terhapus.`)) {
      return
    }

    try {
      const res = await fetch(`/api/sites/${id}`, { method: "DELETE" })
      if (res.ok) {
        setActionMessage(`Website '${name}' sudah dihapus.`)
        fetchSites()
      } else {
        alert("Gagal menghapus website.")
      }
    } catch {
      alert("Terjadi kesalahan jaringan saat menghapus website.")
    }
  }

  return (
    <PageContainer size="default">
      {/* Header and CTA */}
      <PageHeader
        title="Daftar Website WordPress"
        description="Sambungkan website WordPress Anda secara instan tanpa perlu memasang plugin tambahan di WordPress."
        icon={Globe}
        actions={
          !showAddForm && (
            <Button
              size="sm"
              onClick={() => {
                setFormError(null)
                setTestResult(null)
                setAuthMode("auto")
                setShowAddForm(true)
              }}
              className="cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs shadow-2xs font-semibold"
            >
              <Plus className="size-3.5 text-accent" />
              <span>Sambungkan Web Baru</span>
            </Button>
          )
        }
      />

      {/* Global Action Banner */}
      {effectiveActionMessage && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{effectiveActionMessage}</span>
          </div>
          <button
            onClick={() => {
              setDismissedBanner(true)
              setActionMessage(null)
            }}
            className="text-xs font-bold hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {effectiveFormError && !showAddForm && (
        <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{effectiveFormError}</span>
          </div>
          <button
            onClick={() => {
              setDismissedBanner(true)
              setFormError(null)
            }}
            className="text-xs font-bold hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* INLINE CARD: Form Sambungkan Website Baru */}
      {showAddForm && (
        <Card className="border-primary/40 bg-card shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader className="pb-3 border-b border-border/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Sparkles className="size-4 text-accent" />
                <span>Sambungkan Website WordPress</span>
                <HelpTooltip
                  content={
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-foreground">Koneksi WordPress Mandiri:</p>
                      <p>Menggunakan WP REST API standar dan Application Passwords bawaan WordPress tanpa perlu menginstal plugin tambahan.</p>
                    </div>
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowAddForm(false)}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Hubungkan blog Anda secara langsung via otorisasi WordPress bawaan (bebas salin password) atau gunakan input manual sebagai alternatif.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 flex flex-col gap-4">
            {effectiveFormError && (
              <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{effectiveFormError}</span>
              </div>
            )}

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-3 border-b border-border/80 pb-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("auto")
                    setFormError(null)
                  }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                    authMode === "auto"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  Hubungkan Otomatis (Rekomendasi)
                </button>
                <HelpTooltip
                  content={
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-foreground">Cara Kerja Otorisasi Otomatis:</p>
                      <p>1. Masukkan URL website WordPress Anda.</p>
                      <p>2. Klik tombol <strong>Connect ke WordPress</strong> untuk membuka otorisasi resmi blog Anda.</p>
                      <p>3. Klik <strong>Setujui / Approve</strong> pada WordPress agar website langsung terhubung tanpa salin-tempel password.</p>
                    </div>
                  }
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setAuthMode("manual")
                  setFormError(null)
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
                  authMode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Input Manual (Alternatif)
              </button>
            </div>

            {/* MODE 1: OTOMATIS (CONNECT BUTTON) */}
            {authMode === "auto" ? (
              <form onSubmit={handleAutoConnect} className="flex flex-col gap-4">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Alamat Web (URL) WordPress"
                    required
                    hint="Contoh: https://mywebsite.com"
                  >
                    <Input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://mywebsite.com"
                      className="h-9 text-xs font-mono"
                      required
                      disabled={isConnecting}
                    />
                  </FormField>

                  <FormField
                    label="Nama Tampilan Website (Opsional)"
                    hint="Biarkan kosong untuk deteksi nama otomatis dari WordPress"
                  >
                    <Input
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="Contoh: Blog Tekno & Gadget"
                      className="h-9 text-xs"
                      disabled={isConnecting}
                    />
                  </FormField>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => setAuthMode("manual")}
                    className="text-xs text-muted-foreground hover:text-primary underline cursor-pointer"
                  >
                    Website versi lama? Gunakan input manual Application Password
                  </button>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isConnecting}
                      onClick={() => setShowAddForm(false)}
                      className="cursor-pointer text-xs"
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isConnecting || !baseUrl.trim()}
                      className="cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs shadow-2xs font-semibold"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Menghubungkan ke WordPress...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5 text-accent" />
                          <span>Connect ke WordPress</span>
                          <ArrowRight className="size-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              /* MODE 2: INPUT MANUAL APPLICATION PASSWORD */
              <form onSubmit={handleSaveManualSite} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Nama Tampilan Website" required hint="Contoh: Blog Tekno & Gadget">
                    <Input
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="Beri nama untuk membedakan website ini..."
                      className="h-9 text-xs"
                      required
                    />
                  </FormField>

                  <FormField label="Alamat Web (URL)" required hint="Contoh: https://mywebsite.com">
                    <Input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://mywebsite.com"
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Username WordPress" required hint="Username akun admin atau author blog Anda">
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      className="h-9 text-xs"
                      required
                    />
                  </FormField>

                  <FormField
                    label="Application Password"
                    required
                    hint="Kode 24 karakter dari WordPress (tersimpan terenkripsi)"
                    tooltip={
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-foreground">Cara membuat Application Password:</p>
                        <p>1. Buka <strong>WP Admin &gt; Users &gt; Profile</strong> di blog Anda.</p>
                        <p>2. Gulir ke bawah ke bagian <strong>Application Passwords</strong>.</p>
                        <p>3. Beri nama aplikasi lalu klik <strong>Add New Application Password</strong>.</p>
                        <p>4. Salin kode 24 karakter yang muncul.</p>
                      </div>
                    }
                  >
                    <div className="relative">
                      <KeyRound className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                      <Input
                        type="password"
                        value={appPassword}
                        onChange={(e) => setAppPassword(e.target.value)}
                        placeholder="xxxx xxxx xxxx xxxx"
                        className="pl-8 h-9 text-xs font-mono"
                        required
                      />
                    </div>
                    {baseUrl.trim() && (
                      <div className="pt-0.5">
                        <a
                          href={`${baseUrl.replace(/\/+$/, "")}/wp-admin/authorize-application.php?app_name=${encodeURIComponent(generateAutoWpAppName(username.trim() || currentUserEmail))}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline font-medium"
                        >
                          <span>Buka otorisasi di tab baru untuk buat password</span>
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                  </FormField>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/60">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={isTesting || !baseUrl || !username || !appPassword}
                      className="cursor-pointer text-xs h-8 gap-2 border-border/80"
                    >
                      {isTesting ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Mengecek koneksi...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="size-3.5 text-primary" />
                          <span>Cek Koneksi Dulu</span>
                        </>
                      )}
                    </Button>

                    {testResult && (
                      <span
                        className={`text-xs flex items-center gap-1.5 font-medium ${
                          testResult.ok
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }`}
                      >
                        {testResult.ok ? (
                          <CheckCircle2 className="size-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="size-3.5 shrink-0" />
                        )}
                        <span>{testResult.message}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddForm(false)}
                      className="cursor-pointer text-xs"
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isSaving}
                      className="cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs shadow-2xs font-semibold"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Menyimpan Website...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-3.5" />
                          <span>Simpan Manual</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Content: Table or Empty State */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground gap-2 text-xs">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Memuat daftar website...</span>
        </div>
      ) : sites.length === 0 && !showAddForm ? (
        <EmptyState
          icon={Globe}
          title="Belum ada website yang terhubung"
          description="Sambungkan website WordPress Anda agar artikel yang dibuat bisa langsung terbit atau masuk draf secara otomatis."
        >
          <Button
            size="sm"
            onClick={() => {
              setAuthMode("auto")
              setShowAddForm(true)
            }}
            className="cursor-pointer gap-2"
          >
            Sambungkan Web Baru
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 border-b border-border/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <span className="text-xs font-semibold">
                Website Tersambung ({sites.length})
              </span>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={fetchSites}
              className="cursor-pointer text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="size-3.5" />
              <span>Segarkan</span>
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold">Nama Web</TableHead>
                <TableHead className="text-xs font-semibold">Alamat Web (URL)</TableHead>
                <TableHead className="text-xs font-semibold">Username WP</TableHead>
                <TableHead className="text-xs font-semibold">Status Sambungan</TableHead>
                <TableHead className="text-xs font-semibold">Ditambahkan</TableHead>
                <TableHead className="text-xs font-semibold text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id} className="hover:bg-muted/40">
                  <TableCell className="font-semibold text-xs text-foreground">
                    {site.site_name}
                  </TableCell>
                  <TableCell className="text-xs">
                    <a
                      href={site.base_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-primary hover:underline font-mono text-[11px]"
                    >
                      <span>{site.base_url}</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {site.wp_username}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-[11px] gap-1.5 font-medium border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    >
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <span>{site.status === "connected" ? "Tersambung normal" : site.status}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(site.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDeleteSite(site.id, site.site_name)}
                      className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      title="Hapus Situs"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  )
}

export default function SitesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center p-12 text-muted-foreground gap-2 text-xs">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Memuat website...</span>
        </div>
      }
    >
      <SitesContent />
    </React.Suspense>
  )
}
