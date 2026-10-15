"use client"

import * as React from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { Toaster } from "@/components/atoms/sonner"
import { TooltipProvider } from "@/components/atoms/tooltip"
import { ConfirmProvider } from "@/components/providers/confirm-provider"
import { getQueryClient } from "@/lib/api/query-client"

/**
 * Provider global aplikasi (dipasang sekali di `src/app/layout.tsx`):
 * TanStack Query (cache data client), Tooltip Radix, dialog konfirmasi (`useConfirm`), dan Toaster (`notify`).
 * Devtools TanStack Query hanya dirender saat development (paketnya sendiri no-op di build produksi).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={180} skipDelayDuration={120}>
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster position="bottom-right" closeButton />
      </TooltipProvider>
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />}
    </QueryClientProvider>
  )
}
