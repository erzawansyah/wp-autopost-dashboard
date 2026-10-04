import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { getCategories } from "../../../shared/tools/get-categories"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

export const listCategoriesToolDef: ToolDefinition = {
  id: "list_wp_categories",
  label: "List WordPress Categories",
  description: "Melihat daftar kategori yang tersedia di website WordPress pengguna (ID, nama, deskripsi) untuk memilih kategori artikel yang tepat.",
  category: "wordpress",
  requirements: [{ type: "wp_site", label: "Website WordPress terhubung" }],
  defaultLimit: 2,

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const match = result.match(/Ditemukan (\d+) kategori/)
      if (match) return `Membaca ${match[1]} kategori WordPress`
      return result.slice(0, 120)
    }
    return "Membaca kategori selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async () => {
        if (!ctx.wpCredentials?.baseUrl || !ctx.wpCredentials?.applicationPassword) {
          return "ERROR[no_wp_credentials]: Website WordPress tujuan belum terhubung. Tidak dapat membaca kategori."
        }

        try {
          const res = await getCategories({
            baseUrl: ctx.wpCredentials.baseUrl,
            username: ctx.wpCredentials.username || "",
            applicationPassword: ctx.wpCredentials.applicationPassword,
          })

          if (!res.ok || res.categories.length === 0) {
            return `INFO: Tidak ada kategori khusus di WordPress (hanya Default Uncategorized) atau gagal memuat (${res.error || "Kosong"}).`
          }

          const summaryList = res.categories
            .map((c) => `- ID ${c.id}: "${c.name}"${c.description ? ` (${c.description})` : ""}`)
            .join("\n")

          return `Ditemukan ${res.categories.length} kategori di WordPress:\n${summaryList}\n\nPilih ID kategori yang paling relevan saat menyusun output artikel.`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
          return `ERROR[list_categories_failed]: Gagal membaca kategori dari WordPress: ${msg}`
        }
      },
      {
        name: "list_wp_categories",
        description: "Membaca daftar kategori WordPress di website pengguna agar bisa memilih kategori yang paling relevan.",
        schema: z.object({}),
      }
    )
  },
}
