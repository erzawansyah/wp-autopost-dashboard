import Link from "next/link"
import { Button } from "@/components/atoms/button"
import { Sparkles, Home, PenLine } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
      <div className="max-w-md w-full p-8 rounded-2xl border border-border/80 bg-card shadow-sm flex flex-col items-center text-center gap-5">
        <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
          <Sparkles className="size-6 text-primary" />
        </div>

        <div>
          <span className="text-4xl font-extrabold tracking-tight text-foreground font-mono">
            404
          </span>
          <h1 className="text-lg font-bold tracking-tight text-foreground mt-2">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Alamat yang Anda tuju mungkin salah ketik, sudah dipindahkan, atau fitur ini masih dalam tahap penyiapan.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 w-full pt-2">
          <Button asChild size="sm" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer gap-2">
            <Link href="/">
              <Home className="size-3.5" />
              <span>Ke Dashboard</span>
            </Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="flex-1 text-xs font-semibold cursor-pointer gap-2">
            <Link href="/posts/new">
              <PenLine className="size-3.5" />
              <span>Tulis Artikel</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
