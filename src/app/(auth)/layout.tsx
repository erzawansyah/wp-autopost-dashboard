import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { HOME_PATH } from "@/lib/auth/routes"

/**
 * Layout halaman autentikasi (route group `(auth)`: `/login`, `/register`).
 * Pengguna yang sudah masuk dialihkan ke dasbor (proxy biasanya sudah mengalihkan lebih dulu ke `next`).
 */
export default async function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSession()
  if (user) redirect(HOME_PATH)

  return children
}
