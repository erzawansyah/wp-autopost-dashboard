import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { getAuthor } from "../../../shared/tools/get-author"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

export const listAuthorsToolDef: ToolDefinition = {
  id: "list_wp_authors",
  label: "List WordPress Authors",
  description: "Melihat daftar akun penulis/author di WordPress beserta bio profilnya untuk memilih persona sudut pandang penulisan yang tepat.",
  category: "wordpress",
  requirements: [{ type: "wp_site", label: "Website WordPress terhubung" }],
  defaultLimit: 2,

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const match = result.match(/Ditemukan (\d+) penulis/)
      if (match) return `Membaca ${match[1]} penulis WordPress`
      return result.slice(0, 120)
    }
    return "Membaca penulis selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async () => {
        if (!ctx.wpCredentials?.baseUrl || !ctx.wpCredentials?.applicationPassword) {
          return "ERROR[no_wp_credentials]: Website WordPress tujuan belum terhubung. Tidak dapat membaca daftar author."
        }

        try {
          const res = await getAuthor({
            baseUrl: ctx.wpCredentials.baseUrl,
            username: ctx.wpCredentials.username || "",
            applicationPassword: ctx.wpCredentials.applicationPassword,
          })

          if (!res.ok || res.authors.length === 0) {
            return "INFO: Hanya ada akun bawaan atau daftar author tidak dapat dimuat."
          }

          const authorList = res.authors
            .map((a) => `- ID ${a.author_id}: "${a.author_name}"${a.author_bio ? ` (${a.author_bio})` : ""}`)
            .join("\n")

          return `Ditemukan ${res.authors.length} penulis di WordPress:\n${authorList}\n\nPilih ID author yang paling sesuai dengan topik artikel (hindari akun 'admin' bila ada author lain).`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
          return `ERROR[list_authors_failed]: Gagal membaca author dari WordPress: ${msg}`
        }
      },
      {
        name: "list_wp_authors",
        description: "Membaca daftar penulis (author) di WordPress agar bisa memilih author yang paling cocok kapasitasnya.",
        schema: z.object({}),
      }
    )
  },
}
