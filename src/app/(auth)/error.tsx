"use client"

import { RouteErrorState } from "@/components/organisms/route-error-state"

/** Error boundary halaman masuk/daftar (tanpa shell dasbor). */
export default function AuthError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <RouteErrorState error={error} retry={retry} homeHref="/login" homeLabel="Ke Halaman Masuk" />
      </div>
    </main>
  )
}
