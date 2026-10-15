import { defineRoute } from "@/server/http/route"
import { listUserGuides } from "@/server/services/docs"

// GET /api/docs — panduan pengguna (docs/guides/0N-*.md) untuk reader in-app; tanpa dokumen internal
export const GET = defineRoute({ auth: "none" }, async () => {
  return { docs: await listUserGuides() }
})
