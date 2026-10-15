"use client"

import { Loader2, Search, Sparkles } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { useZodForm } from "@/lib/hooks/use-zod-form"
import { LinkAnalyzeFormSchema, type LinkAnalyzeFormValues } from "@/lib/validation/tools"

interface LinkAnalyzeFormProps {
  /** Base URL website aktif, untuk contoh URL artikel. */
  siteBaseUrl: string
  isRunning: boolean
  /** Sisa jeda rate limit (detik); tombol nonaktif selama > 0. */
  cooldownSeconds: number
  onAnalyze: (values: LinkAnalyzeFormValues) => void
}

/** Form target artikel baru untuk Link Building (URL wajib, kata kunci & instruksi opsional). */
export function LinkAnalyzeForm({ siteBaseUrl, isRunning, cooldownSeconds, onAnalyze }: LinkAnalyzeFormProps) {
  const form = useZodForm(LinkAnalyzeFormSchema, {
    defaultValues: { newArticleUrl: "", targetKeyword: "", extraInstructions: "" },
  })
  const exampleUrl = `${siteBaseUrl.replace(/\/+$/, "") || "https://blogku.com"}/judul-artikel-baru/`

  return (
    <Card className="gap-4 border-border/80 py-5 shadow-2xs">
      <CardHeader className="border-b border-border/60 px-5 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          <h2>Target Artikel Baru</h2>
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          Masukkan tautan artikel yang baru terbit. AI mencari artikel lama yang relevan di WordPress dan menemukan kalimat
          sisipan yang pas.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-5">
        <form noValidate onSubmit={form.handleSubmit(onAnalyze)} className="flex flex-col gap-4">
          <FieldGroup className="gap-3.5">
            <ControlledField
              control={form.control}
              name="newArticleUrl"
              label="URL artikel baru"
              required
              hint="Artikel tujuan yang ingin dibangun tautan internalnya."
            >
              {(field) => <Input {...field} type="url" inputMode="url" placeholder={exampleUrl} className="h-9 font-mono text-xs" />}
            </ControlledField>

            <ControlledField
              control={form.control}
              name="targetKeyword"
              label="Kata kunci sasaran (opsional)"
              hint="Membantu AI merumuskan anchor text yang lebih terarah."
            >
              {({ value, ...field }) => (
                <Input {...field} value={value ?? ""} placeholder="Contoh: kopi tubruk nusantara" className="h-9 text-xs" />
              )}
            </ControlledField>

            <ControlledField control={form.control} name="extraInstructions" label="Instruksi tambahan (opsional)">
              {({ value, ...field }) => (
                <Textarea
                  {...field}
                  value={value ?? ""}
                  rows={2}
                  placeholder="Contoh: Utamakan artikel yang membahas asal-usul atau tradisi seduh lokal."
                  className="resize-y text-xs"
                />
              )}
            </ControlledField>
          </FieldGroup>

          <Button type="submit" disabled={isRunning || cooldownSeconds > 0} className="w-full cursor-pointer text-xs font-semibold">
            {isRunning ? (
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
            ) : (
              <Search aria-hidden="true" data-icon="inline-start" />
            )}
            {isRunning
              ? "Menganalisis & mencari…"
              : cooldownSeconds > 0
                ? `Tunggu ${cooldownSeconds} detik`
                : "Riset & Temukan Artikel Lama"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
