import { toast, type ExternalToast } from "sonner"
import { isApiClientError } from "@/lib/api/client"

/**
 * Notifikasi toast standar Panitera (Sonner; `<Toaster />` dipasang di `AppProviders`).
 * Pengganti `alert()`. Hanya dipanggil dari kode client (event handler, callback mutation).
 *
 *   notify.success("Website berhasil dihapus.")
 *   notify.error(error)                                   // ApiClientError → pesan server; selain itu fallback
 *   notify.error(error, { fallback: "Gagal menghapus website." })
 *   await notify.promise(mutation.mutateAsync(input), { loading: "Menyimpan…", success: "Tersimpan." })
 */

const DEFAULT_ERROR_MESSAGE = "Terjadi kesalahan. Silakan coba lagi."
const MAX_ISSUES_IN_DESCRIPTION = 3

export interface NotifyErrorOptions extends ExternalToast {
  /** Pesan bila error bukan ApiClientError (mis. bug client) — detail teknis tidak pernah ditampilkan. */
  fallback?: string
}

/**
 * Pesan aman untuk pengguna: string apa adanya, `ApiClientError.message` (sudah disaring server & berbahasa
 * Indonesia), selain itu `fallback`. `Error.message` biasa TIDAK ditampilkan (bisa berisi detail internal).
 */
export function errorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  if (typeof error === "string" && error.trim()) return error
  if (isApiClientError(error)) return error.message
  return fallback
}

function issuesDescription(error: unknown): string | undefined {
  if (!isApiClientError(error) || !error.issues?.length) return undefined
  const lines = error.issues
    .slice(0, MAX_ISSUES_IN_DESCRIPTION)
    .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))
  const rest = error.issues.length - MAX_ISSUES_IN_DESCRIPTION
  if (rest > 0) lines.push(`…dan ${rest} masalah lain.`)
  return lines.join("\n")
}

interface NotifyPromiseMessages<T> {
  loading: string
  success: string | ((data: T) => string)
  /** Default: pesan dari `errorMessage(error)`. */
  error?: string | ((error: unknown) => string)
}

export const notify = {
  success(message: string, options?: ExternalToast) {
    return toast.success(message, options)
  },
  info(message: string, options?: ExternalToast) {
    return toast.info(message, options)
  },
  warning(message: string, options?: ExternalToast) {
    return toast.warning(message, options)
  },
  error(error: unknown, options: NotifyErrorOptions = {}) {
    const { fallback, ...toastOptions } = options
    return toast.error(errorMessage(error, fallback), {
      description: issuesDescription(error),
      ...toastOptions,
    })
  },
  /** Toast loading → sukses/gagal untuk satu promise; mengembalikan promise aslinya (tetap bisa di-`await`/`catch`). */
  promise<T>(promise: Promise<T>, messages: NotifyPromiseMessages<T>): Promise<T> {
    const { error: errorMessageOption } = messages
    toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: (error: unknown) =>
        typeof errorMessageOption === "function"
          ? errorMessageOption(error)
          : (errorMessageOption ?? errorMessage(error)),
    })
    return promise
  },
}
