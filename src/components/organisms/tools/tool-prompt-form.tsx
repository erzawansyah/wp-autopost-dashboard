"use client"

import type { z } from "zod"
import { Lightbulb, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { useZodForm } from "@/lib/hooks/use-zod-form"
import type { ToolPromptFormInput } from "@/lib/validation/tools"

interface ToolPromptFormProps {
  /** `CategorySuggestFormSchema` / `AuthorSuggestFormSchema` (`src/lib/validation/tools.ts`). */
  schema: z.ZodType<ToolPromptFormInput, ToolPromptFormInput>
  title: string
  description: string
  label: string
  placeholder: string
  presetsLabel: string
  /** Contoh instruksi; klik = isi instruksi lalu langsung jalankan AI. */
  presets: readonly string[]
  submitLabel: string
  runningLabel: string
  isRunning: boolean
  /** Sisa jeda rate limit (detik); tombol nonaktif selama > 0. */
  cooldownSeconds: number
  onRun: (prompt: string) => void
}

/** Form instruksi AI bersama (Kategori & Author Creator): textarea instruksi, ide cepat, dan tombol run. */
export function ToolPromptForm({
  schema,
  title,
  description,
  label,
  placeholder,
  presetsLabel,
  presets,
  submitLabel,
  runningLabel,
  isRunning,
  cooldownSeconds,
  onRun,
}: ToolPromptFormProps) {
  const form = useZodForm(schema, { defaultValues: { prompt: "" } })
  const blocked = isRunning || cooldownSeconds > 0

  function runPreset(preset: string) {
    form.setValue("prompt", preset, { shouldDirty: true, shouldValidate: true })
    onRun(preset)
  }

  return (
    <Card className="gap-4 border-border/80 py-5 shadow-2xs">
      <CardHeader className="border-b border-border/60 px-5 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
      </CardHeader>

      <CardContent className="px-5">
        <form noValidate onSubmit={form.handleSubmit((values) => onRun(values.prompt))} className="flex flex-col gap-3.5">
          <FieldGroup className="gap-3">
            <ControlledField control={form.control} name="prompt" label={label} required>
              {(field) => <Textarea {...field} rows={3} placeholder={placeholder} className="resize-y text-xs" />}
            </ControlledField>
          </FieldGroup>

          <div role="group" aria-label={presetsLabel} className="flex flex-wrap items-center gap-1.5">
            <span aria-hidden="true" className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Lightbulb className="size-3.5" />
              {presetsLabel}
            </span>
            {presets.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="xs"
                disabled={blocked}
                onClick={() => runPreset(preset)}
                className="h-auto cursor-pointer py-1 text-left font-normal whitespace-normal text-muted-foreground hover:text-foreground"
              >
                {preset}
              </Button>
            ))}
          </div>

          <Button type="submit" size="sm" disabled={blocked} className="w-full cursor-pointer text-xs font-semibold">
            {isRunning ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
                {runningLabel}
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" data-icon="inline-start" />
                {cooldownSeconds > 0 ? `Tunggu ${cooldownSeconds} detik` : submitLabel}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
