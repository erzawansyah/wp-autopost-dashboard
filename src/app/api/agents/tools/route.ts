import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { ToolRegistry } from "@/core/writer/tools"
import { checkToolEligibility } from "@/core/writer/tools/eligibility"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")

    const userKeys = await getUserDecryptedKeys(user.id)

    let wpCredentials: { baseUrl?: string; applicationPassword?: string } | undefined
    if (siteId) {
      const { data: site } = await supabase
        .from("wp_sites")
        .select("base_url, encrypted_app_password")
        .eq("id", siteId)
        .eq("user_id", user.id)
        .single()

      if (site) {
        wpCredentials = {
          baseUrl: site.base_url,
          applicationPassword: site.encrypted_app_password ? "available" : undefined,
        }
      }
    }

    const allRegisteredTools = ToolRegistry.getAll()
    const allToolIds = allRegisteredTools.map((t) => t.id)
    const eligibility = checkToolEligibility(allToolIds, userKeys, wpCredentials)

    const blockedMap = new Map(eligibility.blockedTools.map((b) => [b.id, b]))

    const toolsWithStatus = allRegisteredTools.map((tool) => {
      const blocked = blockedMap.get(tool.id)
      return {
        id: tool.id,
        label: tool.label,
        description: tool.description,
        requirements: tool.requirements || [],
        isEligible: !blocked,
        missingRequirements: blocked ? blocked.missingRequirements : [],
        blockedReason: blocked ? blocked.reason : null,
      }
    })

    return NextResponse.json({
      tools: toolsWithStatus,
      eligibleCount: eligibility.eligibleToolIds.length,
      totalCount: allRegisteredTools.length,
    })
  } catch (error) {
    console.error("[API/agents/tools] Error:", error)
    return NextResponse.json(
      { error: "Gagal memuat status tools agen." },
      { status: 500 }
    )
  }
}
