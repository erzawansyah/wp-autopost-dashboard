import { redirect } from "next/navigation"
import { LOGIN_PATH, NEXT_PARAM, sanitizeNextPath } from "@/lib/auth/routes"
import { firstParam, type SearchParamValue } from "@/lib/search-params"

type SearchParams = Promise<Record<string, SearchParamValue>>

/** Alias `/register` → tab Daftar di `/login`; tujuan `next` yang lolos sanitasi ikut diteruskan. */
export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const next = sanitizeNextPath(firstParam((await searchParams)[NEXT_PARAM]))
  const query = new URLSearchParams({ tab: "register" })
  if (next) query.set(NEXT_PARAM, next)
  redirect(`${LOGIN_PATH}?${query.toString()}`)
}
