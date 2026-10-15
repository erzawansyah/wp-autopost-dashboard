import Image from "next/image"
import { AuthCard } from "@/components/organisms/auth/auth-card"
import { NEXT_PARAM, resolvePostLoginPath } from "@/lib/auth/routes"
import { firstParam, type SearchParamValue } from "@/lib/search-params"

type SearchParams = Promise<Record<string, SearchParamValue>>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const defaultTab = firstParam(params.tab) === "register" ? "register" : "login"
  const redirectTo = resolvePostLoginPath(firstParam(params[NEXT_PARAM]))

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-card p-1 shadow-xs">
            <Image
              src="/assets/panitera-favicon.png"
              alt="Logo Panitera"
              width={40}
              height={40}
              className="size-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Panitera</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Publishing Desk &bull; Platform Penerbitan WordPress Multi-Situs
            </p>
          </div>
        </div>

        <AuthCard defaultTab={defaultTab} redirectTo={redirectTo} />

        <p className="text-center text-xs text-muted-foreground">
          Data akun dan kredensial website Anda dienkripsi secara aman
        </p>
      </div>
    </main>
  )
}
