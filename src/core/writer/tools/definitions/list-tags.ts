import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { getTags } from "../../../shared/tools/get-tags"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

export const listTagsToolDef: ToolDefinition = {
  id: "list_wp_tags",
  label: "List WordPress Tags",
  description: "Melihat daftar tag populer yang sudah ada di website WordPress pengguna untuk mencocokkan tag artikel yang relevan.",
  category: "wordpress",
  requirements: [{ type: "wp_site", label: "Website WordPress terhubung" }],
  defaultLimit: 2,

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const match = result.match(/Ditemukan (\d+) tag/)
      if (match) return `Membaca ${match[1]} tag WordPress`
      return result.slice(0, 120)
    }
    return "Membaca tag selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async () => {
        if (!ctx.wpCredentials?.baseUrl || !ctx.wpCredentials?.applicationPassword) {
          return "ERROR[no_wp_credentials]: Website WordPress tujuan belum terhubung. Tidak dapat membaca tag."
        }

        try {
          const res = await getTags({
            baseUrl: ctx.wpCredentials.baseUrl,
            username: ctx.wpCredentials.username || "",
            applicationPassword: ctx.wpCredentials.applicationPassword,
            perPage: 50,
          })

          if (!res.ok || res.tags.length === 0) {
            return "INFO: Belum ada tag yang tersimpan di WordPress. Anda bebas menentukan nama-nama tag baru yang relevan."
          }

          const tagNames = res.tags.map((t) => t.name).join(", ")
          return `Ditemukan ${res.tags.length} tag di WordPress:\n${tagNames}\n\nGunakan tag yang cocok atau tambahkan nama tag baru yang relevan.`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
          return `ERROR[list_tags_failed]: Gagal membaca tag dari WordPress: ${msg}`
        }
      },
      {
        name: "list_wp_tags",
        description: "Membaca daftar tag WordPress yang sudah ada di website pengguna agar bisa memilih tag yang sesuai.",
        schema: z.object({}),
      }
    )
  },
}
