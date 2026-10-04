"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { Badge } from "@/components/atoms/badge"
import { Sparkles, Bot, BrainCircuit, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AgentProfileOption {
  id?: string
  ref: string
  name: string
  description?: string
  mode: "standard" | "deep"
  toolIds?: string[]
  isPreset?: boolean
  isDefault?: boolean
}

interface AgentProfileSelectProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
  className?: string
  label?: string
  description?: string
}

export function AgentProfileSelect({
  value,
  onChange,
  disabled = false,
  error,
  className,
  label = "Profil Agen Kepenulisan",
  description = "Pilih agen AI dan orkestrator yang akan mengeksekusi pembuatan konten.",
}: AgentProfileSelectProps) {
  const [profiles, setProfiles] = React.useState<{
    presets: AgentProfileOption[]
    userProfiles: AgentProfileOption[]
  }>({
    presets: [],
    userProfiles: [],
  })
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true
    async function fetchProfiles() {
      try {
        const res = await fetch("/api/agents")
        if (!res.ok) throw new Error("Gagal mengambil daftar profil agen")
        const data = await res.json()
        if (isMounted) {
          setProfiles({
            presets: data.presets || [],
            userProfiles: data.userProfiles || [],
          })
          // Prioritaskan preset quick-writer atau profil yang bertanda isDefault
          if (!value) {
            const defaultAgent =
              data.presets?.find((p: AgentProfileOption) => p.ref === "preset:quick-writer") ||
              data.userProfiles?.find((p: AgentProfileOption) => p.isDefault) ||
              data.presets?.[0]
            if (defaultAgent) {
              onChange(defaultAgent.ref)
            }
          }
        }
      } catch (err) {
        console.error("[AgentProfileSelect] Error:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchProfiles()
    return () => {
      isMounted = false
    }
  }, [value, onChange])

  const allProfiles = [...profiles.presets, ...profiles.userProfiles]
  const selectedProfile = allProfiles.find((p) => p.ref === value)

  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      {label && (
        <div className="flex h-5 items-center justify-between">
          <label className="text-xs font-semibold text-foreground/90 select-none flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            <span>{label}</span>
          </label>
          {selectedProfile && (
            <Badge
              variant="outline"
              className="text-[9px] uppercase font-mono tracking-wider py-0 px-1.5 bg-muted/40 border-border"
            >
              {selectedProfile.mode === "deep" ? "Deep Agent" : "Standard Agent"}
            </Badge>
          )}
        </div>
      )}

      <Select value={value} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger className="w-full bg-background border-border text-xs focus:ring-primary h-9">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Memuat profil agen...</span>
            </div>
          ) : (
            <SelectValue placeholder="Pilih profil agen..." />
          )}
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {profiles.presets.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                Preset Sistem Bawaan
              </SelectLabel>
              {profiles.presets.map((preset) => (
                <SelectItem key={preset.ref} value={preset.ref} className="text-xs py-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    {preset.mode === "deep" ? (
                      <BrainCircuit className="size-3.5 text-primary shrink-0" />
                    ) : (
                      <Bot className="size-3.5 text-foreground/80 shrink-0" />
                    )}
                    <span className="font-medium text-foreground">{preset.name}</span>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1 font-normal ml-auto text-muted-foreground">
                      {(preset.toolIds || []).length} tools
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {profiles.userProfiles.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1 border-t border-border">
                Profil Agen Kustom
              </SelectLabel>
              {profiles.userProfiles.map((userProf) => (
                <SelectItem key={userProf.ref} value={userProf.ref} className="text-xs py-2 cursor-pointer">
                  <div className="flex items-center gap-2">
                    {userProf.mode === "deep" ? (
                      <BrainCircuit className="size-3.5 text-primary shrink-0" />
                    ) : (
                      <Bot className="size-3.5 text-foreground/80 shrink-0" />
                    )}
                    <span className="font-medium text-foreground">{userProf.name}</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal ml-auto text-muted-foreground">
                      {(userProf.toolIds || []).length} tools
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {description && !error && (
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          {selectedProfile?.description || description}
        </p>
      )}

      {error && <p className="text-[11px] text-destructive mt-1.5">{error}</p>}
    </div>
  )
}
