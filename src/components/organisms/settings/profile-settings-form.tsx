"use client"

import * as React from "react"
import Link from "next/link"
import {
  User,
  Mail,
  ShieldCheck,
  Bell,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Bot,
  Search,
  Image as ImageIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Switch } from "@/components/atoms/switch"
import { Badge } from "@/components/atoms/badge"
import { UserSettingsResponse, NotificationPrefs } from "@/types/settings"

export function ProfileSettingsForm() {
  const [data, setData] = React.useState<UserSettingsResponse | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isSaved, setIsSaved] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // Keys form
  const [pexelsKey, setPexelsKey] = React.useState("")
  const [unsplashKey, setUnsplashKey] = React.useState("")
  const [serpapiKey, setSerpapiKey] = React.useState("")

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = React.useState<NotificationPrefs>({
    email_on_failure: true,
    email_on_batch_complete: true,
    in_app_toast: true,
  })

  const fetchSettings = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/settings/user")
      const result = await res.json()
      if (result.ok) {
        setData(result)
        if (result.notificationPrefs) {
          setNotifPrefs((prev) => ({ ...prev, ...result.notificationPrefs }))
        }
        if (result.keys?.pexels?.configured) {
          setPexelsKey("••••••••••••••••")
        }
        if (result.keys?.unsplash?.configured) {
          setUnsplashKey("••••••••••••••••")
        }
        if (result.keys?.serpapi?.configured) {
          setSerpapiKey("••••••••••••••••")
        }
      }
    } catch (err) {
      console.error("Gagal mengambil data user settings:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setErrorMessage(null)

    try {
      const payload: Record<string, unknown> = {
        notificationPrefs: notifPrefs,
      }

      if (pexelsKey.trim() && !pexelsKey.includes("•")) {
        payload.pexelsKey = pexelsKey.trim()
      } else if (pexelsKey.trim() === "") {
        payload.pexelsKey = ""
      }

      if (unsplashKey.trim() && !unsplashKey.includes("•")) {
        payload.unsplashKey = unsplashKey.trim()
      } else if (unsplashKey.trim() === "") {
        payload.unsplashKey = ""
      }

      if (serpapiKey.trim() && !serpapiKey.includes("•")) {
        payload.serpapiKey = serpapiKey.trim()
      } else if (serpapiKey.trim() === "") {
        payload.serpapiKey = ""
      }

      const res = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const resData = await res.json()
      if (!res.ok || !resData.ok) {
        setErrorMessage(resData.error || "Gagal menyimpan preferensi.")
      } else {
        setIsSaved(true)
        setTimeout(() => setIsSaved(false), 3000)
        fetchSettings()
      }
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="border-border/80 bg-card/60">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="mt-2 text-xs text-muted-foreground">Memuat preferensi profil...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isSaved && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Preferensi dan kunci BYOK berhasil disimpan dengan enkripsi AES-256-GCM.</span>
        </div>
      )}

      {/* Ringkasan Akun & Multi-Tenant ID */}
      <Card className="border-border/80 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="size-4 text-primary" />
            Identitas Akun
          </CardTitle>
          <CardDescription className="text-xs">
            Data identitas tenant terisolasi aman dengan Supabase Row Level Security (RLS).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">User ID (Tenant)</span>
            <div className="font-mono text-xs text-foreground bg-muted/40 p-2 rounded border border-border/50 truncate">
              {data?.userId || "—"}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Status Keamanan Database</span>
            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
              <ShieldCheck className="size-3.5" />
              <span>RLS Aktif &amp; Terproteksi</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Hub Kunci BYOK */}
      <Card className="border-border/80 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-primary" />
            Status Provider Kunci BYOK
          </CardTitle>
          <CardDescription className="text-xs">
            Kunci API Anda dienkripsi di database server dan tidak dapat dibaca oleh pihak lain.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-ai-process" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">OpenRouter AI</span>
                <span className="text-[10px] text-muted-foreground">Model &amp; Penulisan</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant={data?.keys.openrouter.configured ? "default" : "outline"} className="text-[10px]">
                {data?.keys.openrouter.configured ? "Tersambung" : "Default Env"}
              </Badge>
              <Button asChild variant="ghost" size="sm" className="size-7 p-0">
                <Link href="/settings/ai">
                  <ExternalLink className="size-3" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Tavily Search</span>
                <span className="text-[10px] text-muted-foreground">Riset Topik AI</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant={data?.keys.tavily.configured ? "default" : "outline"} className="text-[10px]">
                {data?.keys.tavily.configured ? "Tersambung" : "Belum Diatur"}
              </Badge>
              <Button asChild variant="ghost" size="sm" className="size-7 p-0">
                <Link href="/settings/search">
                  <ExternalLink className="size-3" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Brave Search</span>
                <span className="text-[10px] text-muted-foreground">Riset Web Terbuka</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant={data?.keys.brave.configured ? "default" : "outline"} className="text-[10px]">
                {data?.keys.brave.configured ? "Tersambung" : "Belum Diatur"}
              </Badge>
              <Button asChild variant="ghost" size="sm" className="size-7 p-0">
                <Link href="/settings/search">
                  <ExternalLink className="size-3" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kunci Media & Gambar Tambahan */}
      <Card className="border-border/80 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ImageIcon className="size-4 text-primary" />
            Kunci Media &amp; Gambar Resmi (Opsional)
          </CardTitle>
          <CardDescription className="text-xs">
            Digunakan oleh Image Curator Node untuk mencari gambar royalti bebas resolusi tinggi.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pexels-key" className="text-xs font-medium">
                Pexels API Key
              </Label>
              {data?.keys.pexels.configured && (
                <Badge variant="outline" className="text-[10px] text-emerald-600">
                  Tersimpan
                </Badge>
              )}
            </div>
            <Input
              id="pexels-key"
              type="password"
              placeholder="Kosongkan jika menggunakan scraper bawaan"
              value={pexelsKey}
              onChange={(e) => setPexelsKey(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="unsplash-key" className="text-xs font-medium">
                Unsplash Access Key
              </Label>
              {data?.keys.unsplash.configured && (
                <Badge variant="outline" className="text-[10px] text-emerald-600">
                  Tersimpan
                </Badge>
              )}
            </div>
            <Input
              id="unsplash-key"
              type="password"
              placeholder="Kosongkan jika menggunakan katalog CDN kurasi"
              value={unsplashKey}
              onChange={(e) => setUnsplashKey(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="serpapi-key" className="text-xs font-medium">
                SerpAPI Key (Fallback Cadangan Mesin Pencari)
              </Label>
              {data?.keys.serpapi.configured && (
                <Badge variant="outline" className="text-[10px] text-emerald-600">
                  Tersimpan
                </Badge>
              )}
            </div>
            <Input
              id="serpapi-key"
              type="password"
              placeholder="Kunci SerpAPI untuk Google Search (opsional)"
              value={serpapiKey}
              onChange={(e) => setSerpapiKey(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Preferensi Notifikasi */}
      <Card className="border-border/80 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bell className="size-4 text-primary" />
            Preferensi Notifikasi &amp; Peringatan
          </CardTitle>
          <CardDescription className="text-xs">
            Atur bagaimana sistem memberi tahu Anda saat posting artikel atau antrean batch selesai diproses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium text-foreground">
                Peringatan Kegagalan Posting
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Kirim pemberitahuan segera jika AI generation atau sinkronisasi ke WordPress gagal.
              </p>
            </div>
            <Switch
              checked={notifPrefs.email_on_failure ?? true}
              onCheckedChange={(checked) =>
                setNotifPrefs((prev) => ({ ...prev, email_on_failure: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium text-foreground">
                Laporan Batch Selesai
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Kirim ringkasan saat seluruh kata kunci dalam satu antrean batch selesai diterbitkan.
              </p>
            </div>
            <Switch
              checked={notifPrefs.email_on_batch_complete ?? true}
              onCheckedChange={(checked) =>
                setNotifPrefs((prev) => ({ ...prev, email_on_batch_complete: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium text-foreground">
                Toast Notifikasi di Dashboard
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Tampilkan pop-up pemberitahuan aktif saat Anda membuka halaman dashboard.
              </p>
            </div>
            <Switch
              checked={notifPrefs.in_app_toast ?? true}
              onCheckedChange={(checked) =>
                setNotifPrefs((prev) => ({ ...prev, in_app_toast: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          type="submit"
          disabled={isSaving}
          className="cursor-pointer gap-1.5 text-xs px-5"
        >
          {isSaving && <Loader2 className="size-3.5 animate-spin" />}
          Simpan Semua Preferensi
        </Button>
      </div>
    </form>
  )
}
