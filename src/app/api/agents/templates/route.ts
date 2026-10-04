import { NextResponse } from "next/server"
import { getPresetPrompts } from "@/core/writer/presets/registry"

export async function GET() {
  try {
    const prompts = getPresetPrompts()
    const templates = [
      {
        name: "Template Quick Writer (1-Shot)",
        prompt: prompts.quick,
      },
      {
        name: "Template Research & Media Writer",
        prompt: prompts.research,
      },
      {
        name: "Template Deep Research Agent",
        prompt: prompts.deep,
      },
    ]

    return NextResponse.json({ templates })
  } catch (error) {
    console.error("[API/agents/templates] Error loading templates:", error)
    return NextResponse.json(
      { error: "Gagal memuat template prompt preset" },
      { status: 500 }
    )
  }
}
