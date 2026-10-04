"use client"

import * as React from "react"
import {
  User,
  ShieldCheck,
  Bell,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FlaskConical,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Label } from "@/components/atoms/label"
import { Switch } from "@/components/atoms/switch"
import { UserSettingsResponse, NotificationPrefs } from "@/types/settings"
import { useDeveloperMode } from "@/lib/hooks/use-developer-mode"

export function ProfileSettingsForm() {
  const { developerMode: globalDevMode, setDeveloperMode } = useDeveloperMode()
  const [data, setData] = React.useState<UserSettingsResponse | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isSaved, setIsSaved] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // Developer mode local state
  const [devMode, setDevMode] = React.useState<boolean>(globalDevMode)

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
        if (typeof result.developerMode === "boolean") {
          setDevMode(result.developerMode)
          setDeveloperMode(result.developerMode)
        }
      }
    } catch (err) {
      console.error("Gagal mengambil data user settings:", err)
    } finally {
      setIsLoading(false)
    }
  }, [setDeveloperMode])

  React.useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setErrorMessage(null)

    try {
      const payload = {
        notificationPrefs: notifPrefs,
        developerMode: devMode,
      }

      const res = await fetch("/api/settings/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const resData = await res.json()
      if (!res.ok || !resData.ok) {
        setErrorMessage(resData.error || "Gagal menyimpan preferensi profil.")
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
          <p className="mt-2 text-xs text-muted-foreground">Memuat profil akun...</p>
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
          <span>Preferensi profil berhasil disimpan.</span>
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

      {/* Mode Pengembang (Developer Mode) */}
      <Card className="border-border/80 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FlaskConical className="size-4 text-primary" />
            Mode Pengembang (Developer Mode)
          </CardTitle>
          <CardDescription className="text-xs">
            Akses modul eksperimental, perkakas pengujian tool agen, dan sandbox internal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium text-foreground">
                Laboratorium Pengujian Agen (/lab)
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Tampilkan menu Laboratorium di navigasi untuk menguji perkakas riset web, visual, dan pipeline agen.
              </p>
            </div>
            <Switch
              checked={devMode}
              onCheckedChange={(checked) => {
                setDevMode(checked)
                setDeveloperMode(checked)
              }}
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
          Simpan Preferensi
        </Button>
      </div>
    </form>
  )
}
