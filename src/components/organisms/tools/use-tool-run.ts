"use client"

import * as React from "react"
import { useMutation, type UseMutateFunction } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { isAbortError, rateLimitRetrySeconds } from "./tool-helpers"

/** Body run AI WP Tools: selalu terikat satu situs WordPress. */
type ToolRunInput = Record<string, unknown> & { siteId: string }

export interface ToolRun<TInput extends ToolRunInput, TData> {
  /** `mutate` TanStack: opsi per panggilan (`onSuccess`) hanya dijalankan selama komponen masih ter-mount. */
  run: UseMutateFunction<TData, Error, TInput>
  /** Ulangi run terakhir untuk situs yang sama (setelah gagal jaringan/5xx). */
  retry: () => void
  /** Batalkan request yang berjalan (server ikut membatalkan panggilan LLM & WordPress) dan kosongkan hasil. */
  cancel: () => void
  isRunning: boolean
  /** Hasil run terakhir untuk situs aktif; hasil situs lain tidak pernah ditampilkan. */
  data: TData | undefined
  /** Galat run terakhir untuk situs aktif (`null` bila tidak ada / dibatalkan). */
  error: unknown
  /** Penanda unik tiap run (`submittedAt`) — dipakai sebagai `key` daftar hasil agar state persetujuan ter-reset. */
  runId: number
  /** Sisa detik jeda setelah 429 `rate_limited`; tombol run dinonaktifkan selama > 0. */
  cooldownSeconds: number
}

/**
 * Run AI WP Tools (`POST /api/tools/**`) sebagai mutation TanStack dengan `AbortController`:
 * meninggalkan halaman, mengganti situs, atau menekan "Batalkan" memutus request — route API meneruskan
 * `request.signal` ke LLM & pembacaan WordPress sehingga kuota tidak terbuang.
 */
export function useToolRun<TInput extends ToolRunInput, TData extends object>(
  path: string,
  siteId: string
): ToolRun<TInput, TData> {
  const controllerRef = React.useRef<AbortController | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = React.useState(0)

  const abortInFlight = React.useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  // Unmount (pindah halaman) atau ganti situs → request AI situs sebelumnya dibatalkan.
  React.useEffect(() => abortInFlight, [abortInFlight, siteId])

  // Hitung mundur jeda rate limit (detik).
  React.useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = window.setTimeout(() => setCooldownSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldownSeconds])

  const mutation = useMutation({
    mutationFn: (input: TInput) => {
      abortInFlight()
      const controller = new AbortController()
      controllerRef.current = controller
      return apiFetch<TData>(path, { method: "POST", body: input, signal: controller.signal })
    },
    onError: (error) => {
      const waitSeconds = rateLimitRetrySeconds(error)
      if (waitSeconds !== null) setCooldownSeconds(waitSeconds)
    },
  })

  const { mutate, reset, variables, isPending, data, error, submittedAt } = mutation
  const isCurrent = variables?.siteId === siteId

  const cancel = React.useCallback(() => {
    abortInFlight()
    reset()
  }, [abortInFlight, reset])

  const retry = React.useCallback(() => {
    if (variables) mutate(variables)
  }, [mutate, variables])

  return {
    run: mutate,
    retry,
    cancel,
    isRunning: isPending && isCurrent,
    data: isCurrent ? data : undefined,
    error: isCurrent && error && !isAbortError(error) ? error : null,
    runId: submittedAt,
    cooldownSeconds,
  }
}
