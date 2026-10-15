import * as React from "react"
import { Bot, BrainCircuit, Wrench } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/atoms/card"
import { cn } from "@/lib/utils"
import type { AgentProfileSummary } from "@/types/agents"

const MAX_VISIBLE_TOOLS = 3

interface AgentProfileCardProps {
  profile: AgentProfileSummary
  /** Aksi kartu (edit/hapus untuk profil kustom, kloning untuk preset) disusun pemanggil. */
  children: React.ReactNode
}

/** Kartu ringkas satu Agent Profile (presentasional; aman dirender dari Server maupun Client Component). */
export function AgentProfileCard({ profile, children }: AgentProfileCardProps) {
  const isDeep = profile.mode === "deep"
  const ModeIcon = isDeep ? BrainCircuit : Bot
  const visibleTools = profile.toolIds.slice(0, MAX_VISIBLE_TOOLS)
  const hiddenToolCount = profile.toolIds.length - visibleTools.length

  return (
    <Card className={cn("w-full justify-between gap-4 py-5 shadow-2xs", profile.isPreset ? "bg-card/60" : "bg-card")}>
      <CardHeader className="gap-2 px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                isDeep ? "bg-ai-process/10 text-ai-process-strong" : "bg-muted text-foreground"
              )}
            >
              <ModeIcon aria-hidden="true" className="size-4" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <CardTitle className="truncate text-sm">{profile.name}</CardTitle>
              <Badge variant="outline" className="px-1 py-0 font-mono text-2xs tracking-wider uppercase">
                {isDeep ? "Deep Agent" : "Standard Agent"}
              </Badge>
            </div>
          </div>
          {profile.isPreset ? (
            <Badge variant="secondary" className="font-mono text-2xs uppercase">
              Preset
            </Badge>
          ) : (
            profile.isDefault && (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-2xs text-primary">
                Default
              </Badge>
            )
          )}
        </div>
        <CardDescription className="line-clamp-2 text-xs">
          {profile.description || "Tidak ada deskripsi."}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1 text-2xs font-medium text-muted-foreground">
            <Wrench aria-hidden="true" className="size-3" /> Tools ({profile.toolIds.length}):
          </span>
          {visibleTools.length === 0 ? (
            <span className="text-2xs text-muted-foreground italic">1-Shot tanpa tools</span>
          ) : (
            visibleTools.map((toolId) => (
              <Badge key={toolId} variant="secondary" className="px-1.5 py-0 font-mono text-2xs">
                {toolId}
              </Badge>
            ))
          )}
          {hiddenToolCount > 0 && <span className="text-2xs text-muted-foreground">+{hiddenToolCount} lainnya</span>}
        </div>
      </CardContent>

      <CardFooter className="gap-2 border-t border-border/60 px-5 [.border-t]:pt-4">{children}</CardFooter>
    </Card>
  )
}
