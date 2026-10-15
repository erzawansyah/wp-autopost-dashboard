"use client"

import * as React from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"
import { Bot, ClipboardCopy, Eye, FileCode2, Lightbulb, Plus, Sparkles } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"
import { buildPromptGuidance } from "@/components/organisms/agents/prompt-guidance"
import { AGENT_PROFILE_INPUT_BOUNDS } from "@/core/writer/types/profile"
import type { AgentProfileFormOutput, AgentProfileFormValues } from "@/lib/validation/agents"
import { notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"

type PromptView = "raw" | "preview"

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Editor workflow prompt Agent Profile: Raw/Pratinjau, sisip nama tool/skill ke kursor, dan contoh instruksi. */
export function AgentWorkflowPromptField() {
  const { control, getValues, setValue } = useFormContext<AgentProfileFormValues, unknown, AgentProfileFormOutput>()
  const [workflowPrompt = "", toolIds = [], mode, skills = []] = useWatch({
    control,
    name: ["workflowPrompt", "toolIds", "mode", "skills"],
  })
  const { errors } = useFormState({ control, name: "workflowPrompt" })
  const [view, setView] = React.useState<PromptView>("raw")
  // Error validasi hanya terlihat di editor Raw → paksa tampilan Raw selama error ada.
  const activeView: PromptView = errors.workflowPrompt ? "raw" : view
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  const guidance = React.useMemo(() => buildPromptGuidance(toolIds, mode, skills), [toolIds, mode, skills])
  const snippets = mode === "deep" ? [...toolIds, ...skills] : toolIds
  const charCount = workflowPrompt.trim().length

  function insertAtCursor(text: string) {
    const current = getValues("workflowPrompt") ?? ""
    const textarea = activeView === "raw" ? textareaRef.current : null
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    setValue("workflowPrompt", current.slice(0, start) + text + current.slice(end), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
    setView("raw")
    requestAnimationFrame(() => {
      const element = textareaRef.current
      if (!element) return
      const caret = start + text.length
      element.focus()
      element.setSelectionRange(caret, caret)
    })
  }

  function copyExample(text: string) {
    navigator.clipboard.writeText(text).then(
      () => notify.success("Contoh instruksi tersalin."),
      () => notify.error("Gagal menyalin ke clipboard. Salin teks secara manual.")
    )
  }

  return (
    <Card className="gap-4 shadow-xs">
      <CardHeader className="border-b border-border/60 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot aria-hidden="true" className="size-4 text-primary" />
          Alur Kerja Penulisan (Workflow Prompt)
        </CardTitle>
        <CardDescription className="text-xs">
          Tuliskan instruksi langkah demi langkah bagaimana agen meriset, menyusun subbab, dan memakai tools.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <Tabs value={activeView} onValueChange={(value) => setView(value === "preview" ? "preview" : "raw")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList aria-label="Tampilan workflow prompt">
              <TabsTrigger value="raw" className="gap-1.5 text-xs">
                <FileCode2 aria-hidden="true" />
                Raw
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5 text-xs">
                <Eye aria-hidden="true" />
                Pratinjau
              </TabsTrigger>
            </TabsList>
            <Badge variant="outline" className="font-mono" aria-live="polite">
              {countWords(workflowPrompt)} kata
            </Badge>
          </div>

          <TabsContent value="raw" className="flex flex-col gap-3">
            {snippets.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
                  Sisipkan ke kursor:
                </span>
                {snippets.map((snippet) => (
                  <Button
                    key={snippet}
                    type="button"
                    variant="outline"
                    size="xs"
                    className="font-mono"
                    onClick={() => insertAtCursor(`\`${snippet}\``)}
                    aria-label={`Sisipkan ${snippet} ke posisi kursor`}
                  >
                    <Plus aria-hidden="true" />
                    {snippet}
                  </Button>
                ))}
              </div>
            )}

            <ControlledField
              control={control}
              name="workflowPrompt"
              label="Workflow prompt"
              required
              hint={`${charCount.toLocaleString("id-ID")} / ${AGENT_PROFILE_INPUT_BOUNDS.workflowPromptMax.toLocaleString("id-ID")} karakter. Sebut nama tool secara eksplisit, mis. "Gunakan \`web_search\` untuk…".`}
            >
              {({ ref, ...field }) => (
                <Textarea
                  {...field}
                  ref={(element) => {
                    ref(element)
                    textareaRef.current = element
                  }}
                  rows={20}
                  className="min-h-96 resize-y bg-background font-mono text-xs leading-relaxed"
                  placeholder={"1. Gunakan `keyword_suggestions` untuk memetakan ide subbab LSI…\n2. Gunakan `web_search` untuk mencari data terbaru…"}
                />
              )}
            </ControlledField>
          </TabsContent>

          <TabsContent value="preview">
            <MarkdownPreview
              content={workflowPrompt}
              emptyMessage='Belum ada instruksi. Beralih ke tab "Raw" untuk mulai menulis workflow prompt.'
              className="min-h-96"
            />
          </TabsContent>
        </Tabs>

        <details className="group rounded-lg border border-border/80 bg-card shadow-2xs">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-3 text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning-strong">
              <Lightbulb aria-hidden="true" className="size-3.5" />
            </span>
            <span className="text-xs font-semibold text-foreground">Panduan &amp; contoh instruksi tools aktif</span>
            <span className="text-xs text-muted-foreground">({guidance.length})</span>
          </summary>
          <div className="flex flex-col gap-2.5 border-t border-border/60 p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Agen bekerja paling optimal bila nama tool disebut eksplisit di alur kerja. Contoh berikut menyesuaikan tools
              &amp; skill yang sedang aktif.
            </p>
            {guidance.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Pilih tools (atau skill pada mode Deep) untuk melihat contoh.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {guidance.map((item) => (
                  <li key={item.id} className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-bold text-foreground">{item.id}</code>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-2xs",
                          item.type === "skill" ? "border-ai-process/40 text-ai-process-strong" : "text-muted-foreground"
                        )}
                      >
                        {item.role}
                      </Badge>
                    </div>
                    <p className="rounded border border-border/40 bg-background/70 p-2 font-mono text-xs leading-relaxed text-foreground/85 italic">
                      &ldquo;{item.example}&rdquo;
                    </p>
                    <div className="flex items-center gap-1.5 self-end">
                      <Button type="button" variant="ghost" size="xs" onClick={() => copyExample(item.example)}>
                        <ClipboardCopy aria-hidden="true" />
                        Salin
                      </Button>
                      <Button type="button" variant="outline" size="xs" onClick={() => insertAtCursor(`\n- ${item.example}`)}>
                        <Plus aria-hidden="true" />
                        Sisipkan ke prompt
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
