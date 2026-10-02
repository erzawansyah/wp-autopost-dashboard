"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent } from "@/components/atoms/card"
import {
  QuickWriterForm,
  type WpSiteOption,
  type QuickWriterSubmitPayload,
} from "@/components/organisms/quick-writer/quick-writer-form"
import {
  Sparkles,
  FlaskConical,
  ListOrdered,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react"

export default function NewPostPage() {
  const router = useRouter()
  const [sites, setSites] = React.useState<WpSiteOption[]>([])
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)

  // Submission state
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isRedirecting, setIsRedirecting] = React.useState(false)
  const [queuedPostId, setQueuedPostId] = React.useState<string | null>(null)
  const [queuedKeyword, setQueuedKeyword] = React.useState<string>("")
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  // Fetch registered sites on mount
  React.useEffect(() => {
    let isMounted = true

    fetch("/api/sites")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login")
          return Promise.reject(new Error("Unauthorized"))
        }
        return res.json()
      })
      .then((data) => {
        if (!isMounted) return
        if (data.sites && Array.isArray(data.sites)) {
          setSites(data.sites)
        } else {
          setSites([])
        }
      })
      .catch((err) => {
        console.error("Gagal mengambil data website:", err)
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSites(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [router])

  // Handle Form Submission: Mode Background (Instan < 200ms)
  const handleSubmit = async (payload: QuickWriterSubmitPayload) => {
    setErrorMsg(null)
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/posts/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: payload.siteId,
          keyword: payload.keyword,
          engine: payload.engine,
          language: payload.language,
          category_ids: payload.categoryIds,
          category_names: payload.categoryNames,
          tags: payload.tags || undefined,
          customBrief: payload.customBrief || undefined,
          actionStatus: payload.actionStatus,
          aiModel: payload.aiModel,
          apiKey: payload.apiKey || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Gagal memasukkan artikel ke antrean.")
        setIsSubmitting(false)
        return
      }

      // Berhasil masuk antrean! Tampilkan kartu konfirmasi singkat lalu alihkan ke Dashboard
      setQueuedPostId(data.postId)
      setQueuedKeyword(payload.keyword)
      setIsRedirecting(true)

      // Beri jeda 800ms agar pengguna melihat animasi konfirmasi sukses sebelum redirect
      window.setTimeout(() => {
        router.push(`/?queued=true&postId=${data.postId}&keyword=${encodeURIComponent(payload.keyword)}`)
      }, 700)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi gangguan jaringan saat mengirim ke antrean."
      setErrorMsg(message)
      setIsSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Standar */}
        <PageHeader
          title="Tulis Cepat (Quick Writer)"
          description="Hasilkan satu artikel mendalam berstandar anti-slop. Proses berjalan di latar belakang sehingga Anda tidak perlu menunggu di halaman ini."
          icon={Sparkles}
          badge={
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono border-primary/30 text-primary">
              Mode Background
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                asChild
                className="gap-1.5 text-xs font-medium cursor-pointer"
              >
                <Link href="/lab">
                  <FlaskConical className="size-3.5 text-primary" />
                  <span className="hidden sm:inline">Laboratorium</span>
                  <span className="sm:hidden">Lab</span>
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                asChild
                className="gap-1.5 text-xs font-medium cursor-pointer"
              >
                <Link href="/">
                  <ListOrdered className="size-3.5 text-muted-foreground" />
                  <span>Dashboard &amp; Antrean</span>
                </Link>
              </Button>
            </div>
          }
        />

        {/* Transition State saat Berhasil Masuk Antrean & Sedang Redirect */}
        {isRedirecting && (
          <Card className="border-emerald-500/40 bg-emerald-500/5 shadow-xs animate-in zoom-in-95 duration-200">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="size-6 animate-in zoom-in duration-300" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Artikel Berhasil Masuk Antrean Latar Belakang!
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Topik: <strong>&quot;{queuedKeyword}&quot;</strong>. Mesin AI sedang menulis naskah. Mengalihkan ke Dashboard...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-primary font-medium shrink-0">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Membuka Dashboard...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Alert Jika Terjadi Kegagalan Menambahkan ke Antrean */}
        {errorMsg && !isRedirecting && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-center justify-between gap-3 text-xs text-destructive">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setErrorMsg(null)}
              className="text-xs text-destructive hover:bg-destructive/20 border-destructive/40 cursor-pointer"
            >
              Tutup
            </Button>
          </div>
        )}

        {/* Formulir Tulis Cepat */}
        {!isRedirecting && (
          <QuickWriterForm
            sites={sites}
            isLoadingSites={isLoadingSites}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
          />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
