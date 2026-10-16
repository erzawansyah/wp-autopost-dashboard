import Link from "next/link"
import { Hourglass, KeyRound, ServerOff } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import type { Site } from "@/types/site"
import { ReconnectSiteButton } from "./reconnect-site-button"

const QUEUE_LINK_CLASS =
  "rounded-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

/**
 * Petunjuk pemulihan saat status koneksi situs bukan `connected` (aman dirender dari Server Component; tombol
 * "Sambungkan ulang" adalah client component). Status `connected` → tidak merender apa pun.
 */
export function SiteHealthNotice({ site }: { site: Pick<Site, "status" | "base_url" | "site_name"> }) {
  if (site.status === "auth_error") {
    return (
      <Alert variant="destructive" role="note">
        <KeyRound aria-hidden="true" />
        <AlertTitle>Kredensial ditolak WordPress</AlertTitle>
        <AlertDescription>
          <p>
            Application Password website ini sudah dicabut atau kedaluwarsa, atau username WordPress-nya berubah. Artikel
            ke website ini gagal terkirim sampai kredensial diperbarui.
          </p>
          <ol className="flex list-decimal flex-col gap-0.5 pl-4">
            <li>
              Klik <strong>Sambungkan ulang</strong>, lalu setujui di WordPress. Application Password baru dibuat otomatis
              dan menggantikan yang lama; antrean dan pengaturan website ini tetap.
            </li>
            <li>
              Kirim ulang artikel yang gagal dari halaman{" "}
              <Link href="/queue/items" className={QUEUE_LINK_CLASS}>
                Antrean
              </Link>
              .
            </li>
          </ol>
          <p>Masih ditolak? Pastikan akun WordPress-nya masih aktif dan hosting meneruskan header Authorization ke WordPress.</p>
          <ReconnectSiteButton site={site} />
        </AlertDescription>
      </Alert>
    )
  }

  if (site.status === "rate_limited") {
    return (
      <Alert variant="warning" role="note">
        <Hourglass aria-hidden="true" />
        <AlertTitle>Dibatasi hosting</AlertTitle>
        <AlertDescription>
          <p>
            WordPress atau hosting menolak sementara karena terlalu banyak request (HTTP 429). Tunggu 5–15 menit, lalu klik{" "}
            <strong>Cek ulang koneksi</strong>.
          </p>
          <p>
            Bila sering terjadi, turunkan <strong>Batas request paralel</strong> di Pengaturan Website atau minta hosting
            melonggarkan batas request untuk REST API.
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  if (site.status === "unreachable") {
    return (
      <Alert variant="warning" role="note">
        <ServerOff aria-hidden="true" />
        <AlertTitle>Website tidak terjangkau</AlertTitle>
        <AlertDescription>
          <p>
            Panitera tidak mendapat jawaban dari website ini (server mati, DNS atau SSL bermasalah, timeout, atau diblokir
            firewall).
          </p>
          <ol className="flex list-decimal flex-col gap-0.5 pl-4">
            <li>Pastikan website bisa dibuka di browser dan sertifikat SSL-nya masih berlaku.</li>
            <li>Pastikan alamat website adalah alamat finalnya (tanpa pengalihan, mis. ke www atau https).</li>
            <li>Periksa hosting dan firewall/CDN (mis. Cloudflare, Wordfence) agar tidak memblokir server Panitera.</li>
            <li>
              Klik <strong>Cek ulang koneksi</strong> setelah website pulih.
            </li>
          </ol>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
