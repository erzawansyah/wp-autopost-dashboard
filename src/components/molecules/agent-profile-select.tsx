"use client"

import { Bot, BrainCircuit } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/atoms/select"
import type { AgentProfileOption } from "@/lib/queue/writer-options"
import { cn } from "@/lib/utils"

interface AgentProfileSelectProps {
  value: string
  onChange: (ref: string) => void
  /** Preset + profil kustom (disiapkan page RSC dengan `toAgentProfileOptions`). */
  profiles: AgentProfileOption[]
  disabled?: boolean
  id?: string
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-required"?: boolean
}

function ProfileOption({ profile }: { profile: AgentProfileOption }) {
  const Icon = profile.mode === "deep" ? BrainCircuit : Bot
  return (
    <span className="flex w-full items-center gap-2">
      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", profile.mode === "deep" ? "text-primary" : "text-foreground/80")} />
      <span className="font-medium text-foreground">{profile.name}</span>
      <Badge variant="secondary" className="ml-auto px-1 py-0 text-xs font-normal text-muted-foreground">
        {profile.toolCount} tools
      </Badge>
    </span>
  )
}

/** Pemilih Agent Profile (preset bawaan + profil kustom). Label/hint/error diberikan `ControlledField`. */
export function AgentProfileSelect({
  value,
  onChange,
  profiles,
  disabled = false,
  id,
  className,
  ...aria
}: AgentProfileSelectProps) {
  const presets = profiles.filter((profile) => profile.isPreset)
  const custom = profiles.filter((profile) => !profile.isPreset)

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn("h-9 w-full bg-background text-xs", className)} {...aria}>
        <SelectValue placeholder="Pilih Agent Profile..." />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {presets.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground">Preset bawaan</SelectLabel>
            {presets.map((profile) => (
              <SelectItem key={profile.ref} value={profile.ref} className="py-2 text-xs">
                <ProfileOption profile={profile} />
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {custom.length > 0 && (
          <SelectGroup>
            <SelectLabel className="mt-1 border-t border-border text-xs font-semibold text-muted-foreground">
              Agent Profile kustom
            </SelectLabel>
            {custom.map((profile) => (
              <SelectItem key={profile.ref} value={profile.ref} className="py-2 text-xs">
                <ProfileOption profile={profile} />
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}

/** Deskripsi profil terpilih (untuk `hint` field). */
export function agentProfileHint(profiles: AgentProfileOption[], ref: string): string {
  return (
    profiles.find((profile) => profile.ref === ref)?.description ||
    "Pilih Agent Profile yang menjalankan riset & penulisan artikel."
  )
}
