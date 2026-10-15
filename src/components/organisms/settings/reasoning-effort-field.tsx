"use client"

import * as React from "react"
import { Controller, type Control } from "react-hook-form"
import { Badge } from "@/components/atoms/badge"
import { FieldDescription, FieldSet, FieldLegend } from "@/components/atoms/field"
import { RadioGroup, RadioGroupItem } from "@/components/atoms/radio-group"
import { REASONING_EFFORT_OPTIONS } from "@/lib/ai/reasoning"
import { cn } from "@/lib/utils"
import type { ApiKeysFormValues } from "@/lib/validation/settings"

/**
 * Pilihan tingkat penalaran (low/medium/high) sebagai kartu `RadioGroup`: panah keyboard berpindah opsi,
 * fokus terlihat di kartu, dan grup diberi nama lewat `legend`.
 */
export function ReasoningEffortField({ control }: { control: Control<ApiKeysFormValues> }) {
  const idPrefix = React.useId()

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
          <RadioGroup
            value={field.value}
            onValueChange={(value) => {
              const option = REASONING_EFFORT_OPTIONS.find((candidate) => candidate.value === value)
              if (option) field.onChange(option.value)
            }}
            onBlur={field.onBlur}
            className="grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3"
          >
            {REASONING_EFFORT_OPTIONS.map((option) => {
              const isSelected = field.value === option.value
              const id = `${idPrefix}-${option.value}`
              return (
                <label
                  key={option.value}
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-2xs ring-1 ring-primary/30"
                      : "border-border/80 bg-background/50 hover:bg-muted/40"
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className={cn("text-xs font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                      {option.label}
                    </span>
                    <RadioGroupItem id={id} value={option.value} />
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                </label>
              )
            })}
          </RadioGroup>
        </FieldSet>
      )}
    />
  )
}
