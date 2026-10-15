"use client"

import { Controller, type Control } from "react-hook-form"
import { Check } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { FieldDescription, FieldSet, FieldLegend } from "@/components/atoms/field"
import { REASONING_EFFORT_OPTIONS } from "@/lib/ai/reasoning"
import { cn } from "@/lib/utils"
import type { ApiKeysFormValues } from "@/lib/validation/settings"

/**
 * Pilihan tingkat penalaran (low/medium/high) sebagai kartu radio native: panah keyboard berpindah opsi,
 * fokus terlihat di kartu, dan grup diberi nama lewat `legend`.
 */
export function ReasoningEffortField({ control }: { control: Control<ApiKeysFormValues> }) {
  return (
    <Controller
      control={control}
      name="reasoningEffort"
      render={({ field }) => (
        <FieldSet className="gap-2 border-t border-border/50 pt-4">
          <FieldLegend variant="label" className="mb-0 flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
            Tingkat Penalaran (Reasoning Effort)
            <Badge variant="outline" className="font-mono text-2xs uppercase">
              {field.value}
            </Badge>
          </FieldLegend>
          <FieldDescription className="text-xs leading-relaxed">
            Mengatur kedalaman &amp; budget penalaran (thinking tokens) untuk model penalaran seperti DeepSeek R1, Qwen
            Thinking, dan OpenAI o-series.
          </FieldDescription>
          <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3">
            {REASONING_EFFORT_OPTIONS.map((option) => {
              const isSelected = field.value === option.value
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-2xs ring-1 ring-primary/30"
                      : "border-border/80 bg-background/50 hover:bg-muted/40"
                  )}
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={option.value}
                    checked={isSelected}
                    onChange={() => field.onChange(option.value)}
                    onBlur={field.onBlur}
                    className="sr-only"
                  />
                  <span className="flex w-full items-center justify-between">
                    <span className={cn("text-xs font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                      {option.label}
                    </span>
                    {isSelected && <Check aria-hidden="true" className="size-3.5 text-primary" />}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                </label>
              )
            })}
          </div>
        </FieldSet>
      )}
    />
  )
}
