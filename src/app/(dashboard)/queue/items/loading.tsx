import { Skeleton } from "@/components/atoms/skeleton"
import { PageSkeleton } from "@/components/templates/page-skeleton"

/** Kerangka halaman Antrean: toolbar filter + baris tabel. */
export default function QueueItemsLoading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="flex flex-col gap-2 rounded-xl border border-border/80 p-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </PageSkeleton>
  )
}
