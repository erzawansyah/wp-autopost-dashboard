import { redirect } from "next/navigation"

/**
 * Pengaturan model AI default & tingkat penalaran kini bagian dari Pusat Kunci API (`/settings/keys`, bagian
 * "Provider Model AI"). URL lama tetap berfungsi lewat pengalihan.
 */
export default function AiSettingsRedirectPage() {
  redirect("/settings/keys#model-ai")
}
