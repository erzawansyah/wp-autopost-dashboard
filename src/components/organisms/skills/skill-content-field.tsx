"use client"

import * as React from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"
import { Eye, FileCode2, FileText } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"
import { SKILL_INPUT_BOUNDS } from "@/lib/validation/skills"

type ContentView = "raw" | "preview"

interface SkillContentFieldProps {
  /** Aksi tambahan di bawah editor (mis. "Reset template"). */
  footer?: React.ReactNode
}

/** Editor isi SKILL.md (Markdown) dengan tab Raw/Pratinjau; dipakai form buat & edit skill. */
export function SkillContentField({ footer }: SkillContentFieldProps) {
  const { control } = useFormContext<{ content: string }>()
  const content = useWatch({ control, name: "content" }) ?? ""
  const { errors } = useFormState({ control, name: "content" })
  const [view, setView] = React.useState<ContentView>("raw")
  // Pesan validasi hanya terlihat di editor Raw → paksa Raw selama error ada.
  const activeView: ContentView = errors.content ? "raw" : view
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  return (
    <Card className="gap-4 shadow-xs">
      <CardHeader className="border-b border-border/60 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText aria-hidden="true" className="size-4 text-primary" />
          Naskah Dokumen SKILL.md
        </CardTitle>
        <CardDescription className="text-xs">
          Tulis instruksi mendalam dalam format Markdown. Nama & deskripsi di YAML frontmatter (`---`) dibaca otomatis.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Tabs value={activeView} onValueChange={(value) => setView(value === "preview" ? "preview" : "raw")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList aria-label="Tampilan SKILL.md">
              <TabsTrigger value="raw" className="gap-1.5 text-xs">
                <FileCode2 aria-hidden="true" />
                Raw
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5 text-xs">
                <Eye aria-hidden="true" />
                Pratinjau
              </TabsTrigger>
            </TabsList>
            <Badge variant="outline" className="font-mono">
              {wordCount} kata
            </Badge>
          </div>
          <TabsContent value="raw">
            <ControlledField
              control={control}
              name="content"
              label="Isi SKILL.md"
              required
              hint={`${content.trim().length.toLocaleString("id-ID")} / ${SKILL_INPUT_BOUNDS.contentMax.toLocaleString("id-ID")} karakter.`}
            >
              {(field) => (
                <Textarea
                  {...field}
                  rows={24}
                  className="min-h-96 resize-y bg-background font-mono text-xs leading-relaxed"
                  placeholder="Tuliskan pedoman keahlian dalam format Markdown…"
                />
              )}
            </ControlledField>
          </TabsContent>
          <TabsContent value="preview">
            <MarkdownPreview
              content={content}
              emptyMessage='Belum ada isi SKILL.md. Beralih ke tab "Raw" untuk mulai menulis.'
              className="min-h-96"
            />
          </TabsContent>
        </Tabs>
        {footer}
      </CardContent>
    </Card>
  )
}
