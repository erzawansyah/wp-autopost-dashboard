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

const DEFAULT_FALLBACK_PRESETS: AgentProfileOption[] = [
  {
    ref: "preset:quick-writer",
    name: "Quick Writer",
    description: "Generasi cepat mandiri tanpa tools eksternal. Hemat token dan efisien.",
    mode: "standard",
    isPreset: true,
  },
  {
    ref: "preset:research-writer",
    name: "Research Journalist",
    description: "Riset web mendalam, kurasi gambar, dan gaya jurnalistik komprehensif.",
    mode: "standard",
    isPreset: true,
  },
  {
    ref: "preset:deep-research",
    name: "Deep Editorial",
    description: "Orkestrasi multi-turn mandiri dengan penelusuran fakta dan blok Gutenberg lengkap.",
    mode: "deep",
    isPreset: true,
  },
]

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
    presets: DEFAULT_FALLBACK_PRESETS,
    userProfiles: [],
  })
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true
    async function fetchProfiles() {
      try {
        const res = await fetch("/api/agents")
        if (!res.ok) {
          console.warn("[AgentProfileSelect] Server merespons non-OK, menggunakan fallback preset bawaan.")
          if (isMounted) {
            setProfiles({
              presets: DEFAULT_FALLBACK_PRESETS,
              userProfiles: [],
            })
            if (!value) {
              onChange("preset:quick-writer")
            }
          }
          return
        }
        const data = await res.json()
        if (isMounted) {
          const loadedPresets = data.presets && data.presets.length > 0 ? data.presets : DEFAULT_FALLBACK_PRESETS
          setProfiles({
            presets: loadedPresets,
            userProfiles: data.userProfiles || [],
          })
          // Prioritaskan preset quick-writer atau profil yang bertanda isDefault
          if (!value) {
            const defaultAgent =
              loadedPresets.find((p: AgentProfileOption) => p.ref === "preset:quick-writer") ||
              data.userProfiles?.find((p: AgentProfileOption) => p.isDefault) ||
              loadedPresets[0]
            if (defaultAgent) {
              onChange(defaultAgent.ref)
            }
          }
        }
      } catch (err) {
        console.warn("[AgentProfileSelect] Gagal memuat profil agen, menggunakan fallback bawaan:", err)
        if (isMounted) {
          setProfiles({
            presets: DEFAULT_FALLBACK_PRESETS,
            userProfiles: [],
          })
          if (!value) {
            onChange("preset:quick-writer")
          }
        }
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
