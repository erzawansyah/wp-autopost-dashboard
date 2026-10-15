"use client"

import { AlertCircle, Loader2, RefreshCw, Timer, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { isApiClientError } from "@/lib/api/client"
import { errorMessage } from "@/lib/ui/notify"
import { rateLimitRetrySeconds } from "./tool-helpers"
import type { ToolRun } from "./use-tool-run"

interface ToolRunFeedbackProps {
  run: Pick<ToolRun<{ siteId: string }, object>, "isRunning" | "error" | "cancel" | "retry">
  runningTitle: string
  runningDescription: string
  errorFallback: string
}

/**
 * Status run AI bersama WP Tools: indikator proses (dengan tombol Batalkan), batas permintaan 429
 * (hitung mundur ada di tombol run), dan galat lain (Coba lagi hanya untuk jaringan/5xx).
 */
export function ToolRunFeedback({ run, runningTitle, runningDescription, errorFallback }: ToolRunFeedbackProps) {
  if (run.isRunning) {
    return (
      <Alert variant="ai" role="status" aria-live="polite">
        <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        <AlertTitle>{runningTitle}</AlertTitle>
        <AlertDescription>
          <p>{runningDescription}</p>
          <Button type="button" variant="outline" size="xs" onClick={run.cancel} className="mt-1 cursor-pointer">
            <X aria-hidden="true" data-icon="inline-start" />
            Batalkan
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (!run.error) return null

  if (rateLimitRetrySeconds(run.error) !== null) {
    return (
      <Alert variant="warning">
        <Timer aria-hidden="true" />
        <AlertTitle>Batas permintaan AI tercapai</AlertTitle>
        <AlertDescription>
          <p>{errorMessage(run.error)}</p>
          <p>Batas ini mencegah pemakaian kunci API berlebihan. Tombol akan aktif kembali setelah jeda selesai.</p>
        </AlertDescription>
      </Alert>
    )
  }

  const retryable = isApiClientError(run.error) && run.error.isRetryable
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>AI gagal memproses permintaan</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(run.error, errorFallback)}</p>
        {retryable && (
          <Button type="button" variant="outline" size="xs" onClick={run.retry} className="mt-1 cursor-pointer">
            <RefreshCw aria-hidden="true" data-icon="inline-start" />
            Coba lagi
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
