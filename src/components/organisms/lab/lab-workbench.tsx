"use client"

import { useQuery } from "@tanstack/react-query"
import { BrainCircuit, Wrench } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { LabAgentProfileRunner } from "@/components/organisms/lab/lab-agent-profile-runner"
import { LabToolsRunner } from "@/components/organisms/lab/lab-tools-runner"
import { labQueries } from "@/lib/api/queries/lab"
import type { LabRegistry } from "@/types/lab"

export type LabTab = "tools" | "agent"

interface LabWorkbenchProps {
  initialRegistry: LabRegistry
  initialTab: LabTab
}

/** Tab Tools / Agent Profile Laboratorium. Tab aktif disimpan di URL (`?tab=`) agar dapat dibagikan & dirender server. */
export function LabWorkbench({ initialRegistry, initialTab }: LabWorkbenchProps) {
  const { data: registry } = useQuery({ ...labQueries.registry(), initialData: initialRegistry })

  function handleTabChange(value: string) {
    window.history.replaceState(null, "", `?tab=${value === "agent" ? "agent" : "tools"}`)
  }

  return (
    <Tabs defaultValue={initialTab} onValueChange={handleTabChange} className="w-full gap-6">
      <TabsList className="grid w-full max-w-sm grid-cols-2">
        <TabsTrigger value="tools" className="gap-1.5 text-xs">
          <Wrench aria-hidden="true" />
          Tools ({registry.tools.length})
        </TabsTrigger>
        <TabsTrigger value="agent" className="gap-1.5 text-xs">
          <BrainCircuit aria-hidden="true" />
          Agent Profile ({registry.profiles.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tools">
        <LabToolsRunner tools={registry.tools} sites={registry.sites} />
      </TabsContent>
      <TabsContent value="agent">
        <LabAgentProfileRunner profiles={registry.profiles} sites={registry.sites} />
      </TabsContent>
    </Tabs>
  )
}
