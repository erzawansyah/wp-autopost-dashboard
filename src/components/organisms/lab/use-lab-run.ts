"use client"

import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { isAbortError, postLabRun, type LabRunBody } from "@/components/organisms/lab/lab-run"

/**
 * Mutation uji Lab yang dapat dibatalkan: setiap run punya `AbortController` sendiri; run baru, tombol
 * "Batalkan", atau meninggalkan halaman (unmount) memutus request sehingga server menghentikan tool/agen
 * (`request.signal`) dan token tidak terbuang. Error ditampilkan inline oleh runner (`error`); pembatalan
 * dibedakan lewat `isAborted`, bukan sebagai error.
 */
export function useLabRun() {
  const controllerRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  const mutation = useMutation({
    mutationFn: (body: LabRunBody) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      return postLabRun(body, controller.signal)
    },
  })

  const cancel = React.useCallback(() => controllerRef.current?.abort(), [])

  return {
    run: mutation.mutate,
    cancel,
    reset: mutation.reset,
    payload: mutation.data,
    isRunning: mutation.isPending,
    isAborted: mutation.isError && isAbortError(mutation.error),
    error: mutation.isError && !isAbortError(mutation.error) ? mutation.error : null,
  }
}
