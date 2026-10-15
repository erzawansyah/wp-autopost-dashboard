import * as React from "react"
import { Skeleton } from "@/components/atoms/skeleton"
import { PageContainer, type PageContainerProps } from "@/components/templates/page-container"

interface PageSkeletonProps {
  size?: PageContainerProps["size"]
  /** Kerangka isi halaman; default: baris kartu ringkasan + panel tabel. */
  children?: React.ReactNode
}

/**
 * Kerangka loading halaman dasbor (bentuk `PageContainer` + `PageHeader`) untuk `loading.tsx` segmen.
 *
 *   export default function Loading() {
 *     return <PageSkeleton size="narrow"><Skeleton className="h-96 w-full rounded-lg" /></PageSkeleton>
 *   }
 */
export function PageSkeleton({ size, children }: PageSkeletonProps) {
  return (
    <PageContainer size={size} aria-busy="true">
      <span role="status" className="sr-only">
        Memuat halaman…
      </span>
      <div aria-hidden="true" className="flex flex-col gap-3 border-b border-border/70 pb-5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-7 w-full max-w-64" />
        </div>
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-6">
        {children ?? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-24 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-80 w-full rounded-lg" />
          </>
        )}
      </div>
    </PageContainer>
  )
}
