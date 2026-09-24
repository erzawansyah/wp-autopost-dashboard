import * as React from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { Button } from "@/components/atoms/button"
import { Clock, ArrowLeft, PenLine } from "lucide-react"

interface ComingSoonViewProps {
  title: string
  description: string
  eta?: string
}

export function ComingSoonView({
  title,
  description,
  eta = "Tahap berikutnya",
}: ComingSoonViewProps) {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto py-12 text-center items-center">
        <div className="size-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Clock className="size-6" />
        </div>

        <div>
          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider bg-primary/10 px-2.5 py-1 rounded-full">
            Fitur Sedang Disiapkan ({eta})
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground mt-3">
            {title}
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-md mx-auto">
            {description}
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <Button asChild variant="outline" size="sm" className="text-xs cursor-pointer gap-2">
            <Link href="/">
              <ArrowLeft className="size-3.5" />
              <span>Ke Dashboard</span>
            </Link>
          </Button>

          <Button asChild size="sm" className="text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer gap-2">
            <Link href="/posts/new">
              <PenLine className="size-3.5" />
              <span>Tulis Artikel Baru</span>
            </Link>
          </Button>
        </div>
      </div>
    </DashboardLayout>
  )
}
