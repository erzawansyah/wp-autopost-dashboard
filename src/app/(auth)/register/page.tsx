import { redirect } from "next/navigation"
import { LOGIN_PATH, NEXT_PARAM, sanitizeNextPath } from "@/lib/auth/routes"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Alias `/register` → tab Daftar di `/login`; tujuan `next` yang lolos sanitasi ikut diteruskan. */
export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams)[NEXT_PARAM]
  const next = sanitizeNextPath(Array.isArray(raw) ? raw[0] : raw)
  const query = new URLSearchParams({ tab: "register" })
  if (next) query.set(NEXT_PARAM, next)
  redirect(`${LOGIN_PATH}?${query.toString()}`)
}
