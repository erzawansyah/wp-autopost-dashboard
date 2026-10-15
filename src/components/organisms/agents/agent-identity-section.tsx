"use client"

import * as React from "react"
import { useController, useFormContext } from "react-hook-form"
import { Bot, BrainCircuit, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { RadioGroup, RadioGroupItem } from "@/components/atoms/radio-group"
import { Switch } from "@/components/atoms/switch"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import type { AgentMode } from "@/core/writer/types/profile"
import {
  limitsForModeChange,
  type AgentProfileFormOutput,
  type AgentProfileFormValues,
} from "@/lib/validation/agents"
import { cn } from "@/lib/utils"

const MODE_OPTIONS: ReadonlyArray<{ value: AgentMode; label: string; description: string; icon: typeof Bot }> = [
  { value: "standard", label: "Standard", description: "ReAct cepat & hemat token.", icon: Bot },
  { value: "deep", label: "Deep Agent", description: "Perencanaan tugas & skill SKILL.md.", icon: BrainCircuit },
]

/** Pilihan arsitektur runtime; batas yang belum disesuaikan ikut pindah ke default mode baru. */
function ModeRadioGroup() {
  const { control, getValues, setValue } = useFormContext<AgentProfileFormValues, unknown, AgentProfileFormOutput>()
  const { field } = useController({ control, name: "mode" })
  const idPrefix = React.useId()

  function selectMode(value: string) {
    const next = MODE_OPTIONS.find((option) => option.value === value)?.value
    if (!next || next === field.value) return
    const current = getValues("limits")
    const limits = limitsForModeChange(current, field.value, next)
    if (limits !== current) setValue("limits", limits, { shouldDirty: true })
    field.onChange(next)
  }

  return (
    <FieldSet className="gap-0">
      <FieldLegend variant="label" className="mb-1.5 text-xs font-semibold text-foreground/90">
        Arsitektur runtime
      </FieldLegend>
      <RadioGroup value={field.value} onValueChange={selectMode} onBlur={field.onBlur} className="grid-cols-2 gap-2">
        {MODE_OPTIONS.map((option) => {
          const id = `${idPrefix}-${option.value}`
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border bg-card p-2.5 transition-colors",
                "has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                "hover:border-foreground/30"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <option.icon aria-hidden="true" className="size-3.5 text-primary" />
                  {option.label}
                </span>
                <RadioGroupItem id={id} value={option.value} />
              </span>
              <span className="text-2xs leading-tight text-muted-foreground">{option.description}</span>
            </label>
          )
        })}
      </RadioGroup>
    </FieldSet>
  )
}

/** Identitas Agent Profile: nama, deskripsi, mode runtime, dan penanda default. */
export function AgentIdentitySection() {
  const { control } = useFormContext<AgentProfileFormValues, unknown, AgentProfileFormOutput>()

  return (
    <Card className="gap-4 py-5 shadow-xs">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
          Identitas Agen
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <FieldGroup className="gap-4">
          <ControlledField control={control} name="name" label="Nama profil agen" required hint="Nama yang mewakili peran agen ini.">
            {(field) => <Input {...field} placeholder="Contoh: Investigative Tech Reporter" className="text-xs" />}
          </ControlledField>

          <ControlledField control={control} name="description" label="Deskripsi singkat" hint="Ringkasan peran atau niche artikel.">
            {(field) => (
              <Textarea
                {...field}
                rows={2}
                placeholder="Contoh: Artikel analisis mendalam dengan riset fakta web dan foto pilihan."
                className="resize-none text-xs"
              />
            )}
          </ControlledField>

          <ModeRadioGroup />

          <ControlledField
            control={control}
            name="isDefault"
            label="Jadikan default"
            hint="Otomatis dipilih di Tulis Cepat & Tulis Massal."
            className="border-t border-border/60 pt-3"
          >
            {({ value, onChange, onBlur, ref, id, disabled, ...aria }) => (
              <Switch
                ref={ref}
                id={id}
                checked={Boolean(value)}
                onCheckedChange={onChange}
                onBlur={onBlur}
                disabled={disabled}
                aria-invalid={aria["aria-invalid"]}
                aria-describedby={aria["aria-describedby"]}
              />
            )}
          </ControlledField>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
