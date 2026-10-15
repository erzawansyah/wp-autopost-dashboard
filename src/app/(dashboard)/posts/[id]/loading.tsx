import { Skeleton } from "@/components/atoms/skeleton"
import { PageSkeleton } from "@/components/templates/page-skeleton"

/** Kerangka detail artikel: stepper pipeline, ringkasan biaya, dan log. */
export default function PostDetailLoading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </PageSkeleton>
  )
}
