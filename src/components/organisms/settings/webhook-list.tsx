"use client"

import * as React from "react"
import {
  Webhook,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Shield,
  Check,
} from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent } from "@/components/atoms/card"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Badge } from "@/components/atoms/badge"
import { Switch } from "@/components/atoms/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog"
import { WebhookItem, WebhookEvent, AVAILABLE_WEBHOOK_EVENTS } from "@/types/webhook"

export function WebhookList() {
  const [webhooks, setWebhooks] = React.useState<WebhookItem[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null)
  const [testingId, setTestingId] = React.useState<string | null>(null)
  const [testResults, setTestResults] = React.useState<
    Record<string, { ok: boolean; status?: number; latencyMs?: number; error?: string }>
  >({})

  // Form State
  const [formName, setFormName] = React.useState("")
  const [formUrl, setFormUrl] = React.useState("")
  const [selectedEvents, setSelectedEvents] = React.useState<WebhookEvent[]>([
    "post.published",
    "post.failed",
    "batch.completed",
  ])
  const [formSecret, setFormSecret] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // Success Dialog for newly created secret
  const [createdWebhook, setCreatedWebhook] = React.useState<WebhookItem | null>(null)
  const [isCopied, setIsCopied] = React.useState(false)

  const fetchWebhooks = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch("/api/webhooks")
      const data = await res.json()
      if (data.ok) {
        setWebhooks(data.webhooks || [])
      }
    } catch (err) {
      console.error("Gagal memuat webhooks:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let ignore = false
    async function load() {
      if (!ignore) {
        await fetchWebhooks()
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [fetchWebhooks])

  const handleToggleEvent = (event: WebhookEvent) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          url: formUrl,
          events: selectedEvents,
          customSecret: formSecret.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || "Gagal membuat webhook.")
        setIsSubmitting(false)
        return
      }

      setIsCreateOpen(false)
      setCreatedWebhook(data.webhook)
      // Reset form
      setFormName("")
      setFormUrl("")
      setFormSecret("")
      setSelectedEvents(["post.published", "post.failed", "batch.completed"])
      fetchWebhooks()
    } catch {
      setErrorMessage("Terjadi kesalahan jaringan saat membuat webhook.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      setWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, is_active: !currentActive } : w))
      )
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive }),
      })
      if (!res.ok) {
        fetchWebhooks()
      }
    } catch {
      fetchWebhooks()
    }
  }

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus webhook ini?")) return
    setIsDeleting(id)
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: "DELETE" })
      if (res.ok) {
        setWebhooks((prev) => prev.filter((w) => w.id !== id))
      }
    } catch (err) {
      console.error("Gagal menghapus webhook:", err)
    } finally {
      setIsDeleting(null)
    }
  }

  const handleTestWebhook = async (id: string) => {
    setTestingId(id)
    setTestResults((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })

    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: "POST" })
      const data = await res.json().catch(() => null)
      // Sukses: { ok, status, latencyMs }. Gagal (penerima error/tidak terjangkau, 404, 429): { ok: false, error, code }.
      setTestResults((prev) => ({
        ...prev,
        [id]:
          res.ok && data?.ok
            ? { ok: true, status: data.status, latencyMs: data.latencyMs }
            : { ok: false, error: data?.error || "Gagal mengirim tes" },
      }))
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, error: "Gagal mengirim tes" },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const handleCopySecret = () => {
    if (!createdWebhook?.secret) return
    navigator.clipboard.writeText(createdWebhook.secret)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Daftar Webhook Terdaftar
          </h3>
          <p className="text-xs text-muted-foreground">
            Webhook akan memicu payload HTTP POST dengan tanda tangan HMAC-SHA256 ke URL eksternal Anda.
          </p>
        </div>
        <Button
          onClick={() => {
            setErrorMessage(null)
            setIsCreateOpen(true)
          }}
          size="sm"
          className="w-fit cursor-pointer gap-1.5 text-xs"
        >
          <Plus className="size-3.5" />
          Tambah Webhook
        </Button>
      </div>

      {isLoading ? (
        <Card className="border-border/80 bg-card/60">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Memuat daftar webhook...</p>
          </CardContent>
        </Card>
      ) : webhooks.length === 0 ? (
        <Card className="border-dashed border-border/80 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Webhook className="size-6" />
            </div>
            <h4 className="mt-3 text-sm font-medium text-foreground">Belum ada webhook aktif</h4>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Hubungkan sistem autoposting ke Zapier, Make, n8n, Slack, Discord, atau server backend Anda sendiri.
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              variant="outline"
              size="sm"
              className="mt-4 cursor-pointer gap-1.5 text-xs"
            >
              <Plus className="size-3.5" />
              Buat Webhook Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3.5">
          {webhooks.map((item) => {
            const testResult = testResults[item.id]
            const isItemTesting = testingId === item.id

            return (
              <Card
                key={item.id}
                className={`border-border/80 bg-card/90 transition-all ${
                  !item.is_active ? "opacity-60" : ""
                }`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {item.name}
                        </span>
                        <Badge
                          variant={item.is_active ? "default" : "secondary"}
                          className="font-mono text-[10px]"
                        >
                          {item.is_active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        <span className="truncate max-w-[280px] sm:max-w-md">{item.url}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 pr-2">
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={() => handleToggleActive(item.id, item.is_active)}
                          aria-label="Toggle status aktif"
                        />
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isItemTesting || !item.is_active}
                        onClick={() => handleTestWebhook(item.id)}
                        className="h-8 cursor-pointer gap-1.5 text-xs"
                      >
                        {isItemTesting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5 text-primary" />
                        )}
                        Tes Ping
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting === item.id}
                        onClick={() => handleDeleteWebhook(item.id)}
                        className="h-8 w-8 cursor-pointer p-0 text-muted-foreground hover:text-destructive"
                      >
                        {isDeleting === item.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Badges Events */}
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/40 pt-3">
                    <span className="text-[11px] font-medium text-muted-foreground mr-1 self-center">
                      Events:
                    </span>
                    {(item.events || []).map((ev) => (
                      <Badge
                        key={ev}
                        variant="outline"
                        className="border-primary/20 bg-primary/5 text-[10px] text-foreground"
                      >
                        {ev}
                      </Badge>
                    ))}
                  </div>

                  {/* Live Test Feedback Banner */}
                  {testResult && (
                    <div
                      className={`mt-3 flex items-center justify-between rounded-md p-2.5 text-xs ${
                        testResult.ok
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {testResult.ok ? (
                          <CheckCircle2 className="size-4 shrink-0" />
                        ) : (
                          <AlertCircle className="size-4 shrink-0" />
                        )}
                        <span>
                          {testResult.ok
                            ? `Respons berhasil: HTTP ${testResult.status} (Ping: ${testResult.latencyMs}ms)`
                            : `Pengujian gagal: ${testResult.error || "Server tidak merespons"}`}
                        </span>
                      </div>
                      {typeof testResult.latencyMs === "number" && (
                        <span className="font-mono text-[10px] opacity-80">
                          {testResult.latencyMs}ms
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Dialog: Buat Webhook Baru */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateWebhook}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Webhook className="size-4 text-primary" />
                Tambah Webhook Baru
              </DialogTitle>
              <DialogDescription className="text-xs">
                Masukkan endpoint target penerima HTTP POST payload dari sistem.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {errorMessage && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="webhook-name" className="text-xs font-medium">
                  Nama Webhook
                </Label>
                <Input
                  id="webhook-name"
                  placeholder="Contoh: Discord Alerter, Slack Bot, Zapier Sync"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="webhook-url" className="text-xs font-medium">
                  Payload URL
                </Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://example.com/api/webhook"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  required
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Pilih Event yang Memicu Webhook
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {AVAILABLE_WEBHOOK_EVENTS.map((item) => {
                    const isChecked = selectedEvents.includes(item.event)
                    return (
                      <div
                        key={item.event}
                        onClick={() => handleToggleEvent(item.event)}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                          isChecked
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {isChecked && <Check className="size-3" />}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium leading-none text-[11px] text-foreground">
                            {item.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground line-clamp-2">
                            {item.description}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border/40 pt-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="webhook-secret" className="text-xs font-medium">
                    Secret Key Kustom (Opsional)
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    Biarkan kosong untuk auto-generate
                  </span>
                </div>
                <Input
                  id="webhook-secret"
                  type="password"
                  placeholder="Minimal 16 karakter, untuk validasi HMAC-SHA256"
                  minLength={16}
                  maxLength={256}
                  value={formSecret}
                  onChange={(e) => setFormSecret(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || selectedEvents.length === 0}
                className="cursor-pointer gap-1.5 text-xs"
              >
                {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                Simpan &amp; Aktifkan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Dialog: Tampilkan Secret Sekali Saat Baru Dibuat */}
      <Dialog
        open={Boolean(createdWebhook)}
        onOpenChange={(open) => {
          if (!open) setCreatedWebhook(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
              Webhook Berhasil Didaftarkan!
            </DialogTitle>
            <DialogDescription className="text-xs">
              Simpan <strong>Secret Key</strong> di bawah ini sekarang. Demi alasan keamanan, sistem tidak akan menampilkan kunci rahasia ini lagi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <div className="flex items-center gap-2 font-medium">
                <Shield className="size-4 shrink-0" />
                Header Verifikasi:
              </div>
              <p className="mt-1 font-mono text-[11px] leading-relaxed opacity-90">
                X-Panitera-Timestamp: &lt;unix detik&gt;
                <br />
                X-Panitera-Signature: sha256=HMAC_SHA256(secret, &quot;timestamp.rawBody&quot;)
              </p>
              <p className="mt-1.5 leading-relaxed">
                Bandingkan tanda tangan secara constant-time dan tolak timestamp yang selisihnya lebih dari 5 menit.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Secret Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdWebhook?.secret || ""}
                  className="font-mono text-xs select-all bg-muted/40"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopySecret}
                  className="shrink-0 cursor-pointer gap-1.5 text-xs"
                >
                  {isCopied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Salin
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setCreatedWebhook(null)}
              className="w-full cursor-pointer text-xs"
            >
              Saya Sudah Menyimpan Secret Ini
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
