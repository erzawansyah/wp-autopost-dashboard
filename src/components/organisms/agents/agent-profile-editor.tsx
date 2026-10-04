"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Textarea } from "@/components/atoms/textarea"
import { Badge } from "@/components/atoms/badge"
import { Label } from "@/components/atoms/label"
import { Switch } from "@/components/atoms/switch"
import { FormField } from "@/components/molecules/form-field"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"
import {
  Bot,
  BrainCircuit,
  Sparkles,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Save,
  ArrowLeft,
  Loader2,
  Copy,
  FileCode2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Check,
  Plus,
  Eye,
  Sliders,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip"
import {
  MANDATORY_TOOL_IDS,
  ALL_MANDATORY_TOOL_IDS,
  ensureMandatoryToolIds,
} from "@/core/writer/types/profile"

export interface ToolItemWithStatus {
  id: string
  label: string
  description: string
  category?: string
  isEligible: boolean
  missingRequirements: string[]
  blockedReason: string | null
}

interface AgentProfileEditorProps {
  initialData?: {
    id?: string
    name: string
    description?: string
    mode: "standard" | "deep"
    temperature: number
    workflowPrompt: string
    toolIds: string[]
    skills?: string[]
    limits?: {
      maxModelCalls?: number
      maxToolCalls?: number
      timeoutSeconds?: number
      minWordCount?: number
    }
    isDefault?: boolean
  }
  isEditing?: boolean
}

export const BUILTIN_TOOL_IDS = new Set<string>(ALL_MANDATORY_TOOL_IDS)

export function AgentProfileEditor({ initialData, isEditing = false }: AgentProfileEditorProps) {
  const router = useRouter()

  // Form states
  const [name, setName] = React.useState(initialData?.name || "")
  const [description, setDescription] = React.useState(initialData?.description || "")
  const [mode, setMode] = React.useState<"standard" | "deep">(initialData?.mode || "standard")
  const [temperature, setTemperature] = React.useState(initialData?.temperature ?? 0.75)
  const [workflowPrompt, setWorkflowPrompt] = React.useState(initialData?.workflowPrompt || "")
  const [selectedToolIds, setSelectedToolIds] = React.useState<string[]>(() => {
    if (initialData?.toolIds) {
      return initialData.toolIds.filter((id) => !BUILTIN_TOOL_IDS.has(id))
    }
    return ["keyword_suggestions", "web_search", "image_search"]
  })
  const [selectedSkillSlugs, setSelectedSkillSlugs] = React.useState<string[]>(
    initialData?.skills || ["anti-ai-editor"]
  )
  const [availableSkills, setAvailableSkills] = React.useState<
    Array<{ id: string; name: string; slug: string; description?: string; is_system: boolean }>
  >([])
  const [isLoadingSkills, setIsLoadingSkills] = React.useState(true)
  const [isDefault, setIsDefault] = React.useState(Boolean(initialData?.isDefault))

  // Limits
  const [maxModelCalls, setMaxModelCalls] = React.useState(initialData?.limits?.maxModelCalls || (mode === "deep" ? 22 : 12))
  const [maxToolCalls, setMaxToolCalls] = React.useState(initialData?.limits?.maxToolCalls || (mode === "deep" ? 28 : 15))
  const [timeoutSeconds, setTimeoutSeconds] = React.useState(initialData?.limits?.timeoutSeconds || (mode === "deep" ? 360 : 240))
  const [minWordCount, setMinWordCount] = React.useState(initialData?.limits?.minWordCount || (mode === "deep" ? 800 : 600))

  // Tools catalog with eligibility
  const [tools, setTools] = React.useState<ToolItemWithStatus[]>([])
  const [isLoadingTools, setIsLoadingTools] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // Prompt View Mode: raw vs preview
  const [promptViewMode, setPromptViewMode] = React.useState<"raw" | "preview">("raw")

  // Fold / Collapse States untuk Kotak Konfigurasi di Sidebar Kanan
  const [isIdentityOpen, setIsIdentityOpen] = React.useState(true)
  const [isToolsOpen, setIsToolsOpen] = React.useState(true)
  const [isSkillsOpen, setIsSkillsOpen] = React.useState(true)
  const [isLimitsOpen, setIsLimitsOpen] = React.useState(false)

  // Interactive Prompt UI States
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [isHelperOpen, setIsHelperOpen] = React.useState(false)
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)

  // Sync if initialData is provided/updated asynchronously (e.g. clone)
  React.useEffect(() => {
    if (initialData?.toolIds) {
      setSelectedToolIds(initialData.toolIds.filter((id) => !BUILTIN_TOOL_IDS.has(id)))
    }
    if (initialData?.name) setName(initialData.name)
    if (initialData?.description !== undefined) setDescription(initialData.description || "")
    if (initialData?.mode) setMode(initialData.mode)
    if (initialData?.temperature !== undefined) setTemperature(initialData.temperature)
    if (initialData?.workflowPrompt) setWorkflowPrompt(initialData.workflowPrompt)
    if (initialData?.skills) setSelectedSkillSlugs(initialData.skills)
    if (initialData?.isDefault !== undefined) setIsDefault(Boolean(initialData.isDefault))
  }, [initialData])

  React.useEffect(() => {
    async function loadToolsAndSkills() {
      try {
        const [toolsRes, skillsRes, templatesRes] = await Promise.all([
          fetch("/api/agents/tools"),
          fetch("/api/skills"),
          fetch("/api/agents/templates"),
        ])
        if (toolsRes.ok) {
          const data = await toolsRes.json()
          setTools(data.tools || [])
        }
        if (skillsRes.ok) {
          const sData = await skillsRes.json()
          setAvailableSkills(sData.skills || [])
        }
        if (templatesRes && templatesRes.ok && !initialData?.workflowPrompt) {
          const tData = await templatesRes.json()
          if (tData.templates && Array.isArray(tData.templates) && tData.templates.length > 1) {
            setWorkflowPrompt(tData.templates[1].prompt)
          }
        }
      } catch (err) {
        console.error("Gagal memuat tools/skills/templates:", err)
      } finally {
        setIsLoadingTools(false)
        setIsLoadingSkills(false)
      }
    }
    loadToolsAndSkills()
  }, [initialData?.workflowPrompt])

  const optionalTools = React.useMemo(() => {
    return tools.filter((t) => !BUILTIN_TOOL_IDS.has(t.id))
  }, [tools])

  const handleToggleTool = (toolId: string) => {
    setSelectedToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    )
  }

  const handleToggleSkill = (slug: string) => {
    setSelectedSkillSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  // Sisipkan teks ke posisi kursor textarea secara halus
  const handleInsertText = (textToInsert: string) => {
    // Jika sedang dalam mode preview, alihkan otomatis ke mode raw agar user bisa melihat teks tersisip
    if (promptViewMode === "preview") {
      setPromptViewMode("raw")
    }

    setTimeout(() => {
      const textarea = textareaRef.current
      if (!textarea) {
        setWorkflowPrompt((prev) => `${prev} ${textToInsert}`)
        return
      }

      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? 0
      const currentVal = textarea.value

      const updatedVal =
        currentVal.substring(0, start) + textToInsert + currentVal.substring(end)

      setWorkflowPrompt(updatedVal)

      setTimeout(() => {
        textarea.focus()
        const nextPos = start + textToInsert.length
        textarea.setSelectionRange(nextPos, nextPos)
      }, 0)
    }, 10)
  }

  const handleCopyExample = (key: string, exampleText: string) => {
    navigator.clipboard.writeText(exampleText)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Daftar panduan instruksi spesifik untuk tools & skill yang aktif dipilih
  const activeGuidanceItems = React.useMemo(() => {
    const items: Array<{
      id: string
      type: "tool" | "skill"
      name: string
      role: string
      example: string
    }> = []

    if (selectedToolIds.includes("keyword_suggestions")) {
      items.push({
        id: "keyword_suggestions",
        type: "tool",
        name: "keyword_suggestions",
        role: "Saran LSI & Ide Subbab",
        example:
          "Gunakan `keyword_suggestions` di awal perencanaan untuk mencari variasi kata kunci LSI dan topik penelusuran sebagai inspirasi subbab (H2/H3).",
      })
    }

    if (selectedToolIds.includes("web_search")) {
      items.push({
        id: "web_search",
        type: "tool",
        name: "web_search",
        role: "Riset Fakta & Data Web",
        example:
          "Gunakan `web_search` untuk mencari data statistik terkini, studi kasus, atau kutipan pakar terkait topik.",
      })
    }

    if (selectedToolIds.includes("image_search")) {
      items.push({
        id: "image_search",
        type: "tool",
        name: "image_search",
        role: "Pencarian Gambar Estetik",
        example:
          "Cari foto yang relevan dengan topik menggunakan `image_search` (gunakan kata kunci visual bahasa Inggris agar hasil foto estetik).",
      })
    }

    if (selectedToolIds.includes("web_reader")) {
      items.push({
        id: "web_reader",
        type: "tool",
        name: "web_reader",
        role: "Membaca Isi URL Rujukan",
        example:
          "Jika menemukan artikel rujukan atau laporan berbobot dari hasil pencarian, gunakan `web_reader` untuk membaca intisari pembahasannya.",
      })
    }

    if (mode === "deep") {
      if (selectedSkillSlugs.includes("anti-ai-editor")) {
        items.push({
          id: "anti-ai-editor",
          type: "skill",
          name: "anti-ai-editor",
          role: "Humanisasi Naskah (Anti-AI Slop)",
          example:
            "Terapkan standar penulisan humanis anti-ai-editor: variasikan panjang kalimat dan hindari kata klise chatbot.",
        })
      }

      selectedSkillSlugs
        .filter((slug) => slug !== "anti-ai-editor")
        .forEach((slug) => {
          items.push({
            id: slug,
            type: "skill",
            name: slug,
            role: `Panduan Keahlian ${slug}`,
            example: `Terapkan pedoman keahlian dari skill ${slug} selama proses riset dan penulisan naskah.`,
          })
        })
    }

    return items
  }, [selectedToolIds, mode, selectedSkillSlugs])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMessage("Nama profil agen wajib diisi.")
      return
    }
    if (!workflowPrompt.trim()) {
      setErrorMessage("Alur kerja (Workflow Prompt) wajib diisi.")
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const finalToolIds = ensureMandatoryToolIds(selectedToolIds)

      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        temperature,
        workflowPrompt: workflowPrompt.trim(),
        toolIds: finalToolIds,
        skills: selectedSkillSlugs,
        limits: {
          maxModelCalls,
          maxToolCalls,
          timeoutSeconds,
          minWordCount,
        },
        isDefault,
      }

      const url = isEditing && initialData?.id ? `/api/agents/${initialData.id}` : "/api/agents"
      const method = isEditing ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Gagal menyimpan profil agen")
      }

      router.push("/agents")
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan profil agen"
      setErrorMessage(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const promptWordCount = workflowPrompt.trim().split(/\s+/).filter(Boolean).length

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid Layout: Kolom Utama (Prompt Editor) + Sidebar Kanan (Seluruh Konfigurasi Lainnya) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* =========================================================================
            KOLOM UTAMA: KHUSUS PROMPT EDITOR & PREVIEW (lg: 7 cols, xl: 8 cols)
            ========================================================================= */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-5 min-w-0">
          <Card className="border-border bg-card shadow-xs">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Bot className="size-4 text-primary" />
                    <span>Alur Kerja Penulisan (Workflow Prompt)</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Tuliskan instruksi langkah demi langkah bagaimana agen harus meriset, menyusun subbab, dan menggunakan tools.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* View Mode Toggle: Raw vs Preview */}
                  <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPromptViewMode("raw")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                        promptViewMode === "raw"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <FileCode2 className="size-3.5" />
                      <span>Raw</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptViewMode("preview")}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer",
                        promptViewMode === "preview"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Eye className="size-3.5" />
                      <span>Pratinjau</span>
                    </button>
                  </div>

                  <Badge variant="outline" className="text-xs font-mono h-7 px-2">
                    {promptWordCount} Kata
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {/* Quick-Insert Toolbar: Sisipkan nama tool/skill ke posisi kursor (Aktif saat Raw) */}
              {promptViewMode === "raw" && (
                <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-lg border border-border/70 bg-muted/20">
                  <span className="text-[11px] font-medium text-muted-foreground shrink-0 flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    <span>Sisipkan ke kursor:</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedToolIds.map((toolId) => (
                      <button
                        key={toolId}
                        type="button"
                        onClick={() => handleInsertText(`\`${toolId}\``)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-background hover:bg-primary/10 hover:text-primary border border-border/80 text-foreground transition-colors cursor-pointer shadow-2xs"
                        title={`Sisipkan \`${toolId}\` ke posisi kursor`}
                      >
                        <Plus className="size-2.5 text-muted-foreground" />
                        <span>{toolId}</span>
                      </button>
                    ))}

                    {mode === "deep" &&
                      selectedSkillSlugs.map((slug) => (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => handleInsertText(`\`${slug}\``)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-primary/5 hover:bg-primary/15 text-primary border border-primary/25 transition-colors cursor-pointer shadow-2xs"
                          title={`Sisipkan skill \`${slug}\` ke posisi kursor`}
                        >
                          <Plus className="size-2.5 text-primary" />
                          <span>{slug}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Area Editor Raw / Tampilan Preview Terformat */}
              {promptViewMode === "raw" ? (
                <Textarea
                  ref={textareaRef}
                  rows={20}
                  value={workflowPrompt}
                  onChange={(e) => setWorkflowPrompt(e.target.value)}
                  disabled={isSaving}
                  className="font-mono text-xs leading-relaxed bg-background resize-y min-h-[480px]"
                  placeholder="Tuliskan peran agen dan instruksi langkah demi langkah...&#10;Contoh:&#10;1. Gunakan keyword_suggestions untuk memetakan ide subbab LSI...&#10;2. Gunakan web_search untuk mencari data statistik terbaru...&#10;3. Cari foto sampul via image_search..."
                />
              ) : (
                <MarkdownPreview content={workflowPrompt} className="min-h-[480px]" />
              )}

              {/* Collapsible / Accordion Helper: Panduan Penggunaan Tools & Skill Aktif */}
              <div className="rounded-lg border border-border/80 bg-card overflow-hidden transition-all shadow-2xs">
                <button
                  type="button"
                  onClick={() => setIsHelperOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Lightbulb className="size-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-foreground">
                        Panduan &amp; Contoh Instruksi Tools Aktif
                      </span>
                      <span className="text-[11px] text-muted-foreground ml-2">
                        ({activeGuidanceItems.length} Tersedia untuk Profil Ini)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      {isHelperOpen ? "Sembunyikan Panduan" : "Buka Contoh Instruksi"}
                    </span>
                    {isHelperOpen ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isHelperOpen && (
                  <div className="p-3 pt-0 border-t border-border/60 space-y-3">
                    <p className="text-[11px] text-muted-foreground leading-relaxed pt-2.5">
                      <strong>Tips:</strong> Agen bekerja paling optimal jika Anda menyebutkan nama tool secara eksplisit di dalam alur kerja (misal: <em>&quot;Gunakan `web_search` untuk mencari...&quot;</em>). Berikut adalah contoh format perintah yang disesuaikan dengan tools &amp; skill yang sedang Anda aktifkan di sidebar kanan:
                    </p>

                    <div className="flex flex-col gap-2.5">
                      {activeGuidanceItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg border border-border/70 bg-muted/20 hover:border-border transition-all flex flex-col justify-between gap-2"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <code className="text-[11px] font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {item.name}
                                </code>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] py-0 h-4",
                                    item.type === "skill"
                                      ? "border-primary/40 text-primary"
                                      : "border-border text-muted-foreground"
                                  )}
                                >
                                  {item.role}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-[11px] text-foreground/85 leading-relaxed italic bg-background/70 p-2 rounded border border-border/40 font-mono text-[10.5px]">
                              &ldquo;{item.example}&rdquo;
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 pt-0.5 self-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="h-6 text-[10px] gap-1 px-2 font-mono"
                              onClick={() => handleCopyExample(item.id, item.example)}
                            >
                              {copiedKey === item.id ? (
                                <>
                                  <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-600 dark:text-emerald-400">Tersalin</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="size-2.5" />
                                  <span>Salin</span>
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              className="h-6 text-[10px] gap-1 px-2 font-mono bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                              onClick={() => handleInsertText(`\n- ${item.example}`)}
                            >
                              <Plus className="size-2.5" />
                              <span>Sisipkan ke Prompt</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* =========================================================================
            SIDEBAR KANAN: SELURUH KONFIGURASI AGEN SELAIN PROMPT (lg: 5 cols, xl: 4 cols)
            ========================================================================= */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4 min-w-0">
          {/* 1. Identitas & Mode Agen (Foldable) */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader
              className="pb-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => setIsIdentityOpen((prev) => !prev)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="size-3.5 text-primary" />
                  <span>Identitas Agen</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {mode === "deep" ? "Deep Agent" : "Standard"}
                  </Badge>
                  {isIdentityOpen ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {isIdentityOpen && (
              <CardContent className="space-y-3.5 pt-0">
                <FormField label="Nama Profil Agen" required hint="Beri nama yang mewakili peran agen ini.">
                  <Input
                    placeholder="Contoh: Investigative Tech Reporter"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSaving}
                    className="text-xs"
                  />
                </FormField>

                <FormField label="Deskripsi Singkat" hint="Ringkasan peran atau niche artikel.">
                  <Textarea
                    rows={2}
                    placeholder="Contoh: Menulis artikel analisis mendalam dengan riset fakta web dan foto curated."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSaving}
                    className="text-xs resize-none"
                  />
                </FormField>

                {/* Mode Selector */}
                <div>
                  <Label className="text-xs font-semibold text-foreground mb-1.5 block">
                    Arsitektur Runtime
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      onClick={() => setMode("standard")}
                      className={cn(
                        "p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                        mode === "standard"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-border/80 bg-card"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Bot className="size-3.5 text-primary" />
                        <span className="text-xs font-bold text-foreground">Standard</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        ReAct cepat &amp; hemat token.
                      </p>
                    </div>

                    <div
                      onClick={() => setMode("deep")}
                      className={cn(
                        "p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                        mode === "deep"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-border/80 bg-card"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <BrainCircuit className="size-3.5 text-primary" />
                        <span className="text-xs font-bold text-foreground">Deep Agent</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Task planning &amp; Skills.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Default Profile Switch */}
                <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold text-foreground">Jadikan Default</Label>
                    <p className="text-[10.5px] text-muted-foreground">Otomatis dipilih di Tulis Cepat &amp; Batch</p>
                  </div>
                  <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                </div>
              </CardContent>
            )}
          </Card>

          {/* 2. Katalog Universal Tools (Foldable) */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader
              className="pb-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => setIsToolsOpen((prev) => !prev)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wrench className="size-3.5 text-primary" />
                  <span>Universal Tools</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs font-mono">
                    {selectedToolIds.length} Terpilih
                  </Badge>
                  {isToolsOpen ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {isToolsOpen && (
              <CardContent className="pt-0">
                {isLoadingTools ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span>Memeriksa tools...</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                      {optionalTools.map((tool) => {
                        const isSelected = selectedToolIds.includes(tool.id)
                        return (
                          <div
                            key={tool.id}
                            onClick={() => handleToggleTool(tool.id)}
                            className={cn(
                              "flex items-center justify-between gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all",
                              isSelected
                                ? "border-primary/60 bg-primary/5"
                                : "border-border hover:border-border/80 bg-card"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {tool.label}
                              </span>
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-muted-foreground hover:text-foreground inline-flex items-center focus:outline-none shrink-0"
                                      aria-label={`Informasi tentang ${tool.label}`}
                                    >
                                      <HelpCircle className="size-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs text-xs">
                                    {tool.description}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {tool.isEligible ? (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                  <CheckCircle2 className="size-3" /> Siap
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5">
                                  <AlertTriangle className="size-3" /> Konfig
                                </span>
                              )}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // handled by parent onClick
                                className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
              </CardContent>
            )}
          </Card>

          {/* 3. Deep Agent Skills Selection (Foldable - Hanya jika mode === "deep") */}
          {mode === "deep" && (
            <Card className="border-border bg-card shadow-xs">
              <CardHeader
                className="pb-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
                onClick={() => setIsSkillsOpen((prev) => !prev)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileCode2 className="size-3.5 text-primary" />
                    <span>Skill Registry</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="xs" asChild className="h-6 text-[10px] px-2 text-primary" onClick={(e) => e.stopPropagation()}>
                      <Link href="/skills" target="_blank">
                        Buka Registry
                      </Link>
                    </Button>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {selectedSkillSlugs.length} Aktif
                    </Badge>
                    {isSkillsOpen ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {isSkillsOpen && (
                <CardContent className="pt-0">
                  {isLoadingSkills ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      <span>Memuat skill...</span>
                    </div>
                  ) : availableSkills.length === 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      Belum ada skill yang terdaftar di sistem.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {availableSkills.map((skill) => {
                        const isSelected = selectedSkillSlugs.includes(skill.slug)
                        return (
                          <div
                            key={skill.slug}
                            onClick={() => handleToggleSkill(skill.slug)}
                            className={cn(
                              "flex items-center justify-between gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all",
                              isSelected
                                ? "border-primary/60 bg-primary/5"
                                : "border-border hover:border-border/80 bg-card"
                            )}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {skill.name}
                              </span>
                              {skill.is_system && (
                                <Badge variant="outline" className="text-[9px] py-0 h-4 border-primary/30 text-primary shrink-0">
                                  Sistem
                                </Badge>
                              )}
                            </div>

                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent onClick
                              className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}

          {/* 4. Parameter & Batas Runtime (Foldable) */}
          <Card className="border-border bg-card shadow-xs">
            <CardHeader
              className="pb-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
              onClick={() => setIsLimitsOpen((prev) => !prev)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sliders className="size-3.5 text-primary" />
                  <span>Parameter &amp; Batas Runtime</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Temp {temperature.toFixed(2)}
                  </Badge>
                  {isLimitsOpen ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            </CardHeader>

            {isLimitsOpen && (
              <CardContent className="space-y-4 pt-0">
                {/* Temperature Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="font-semibold text-foreground">Temperatur Kreativitas</Label>
                    <span className="font-mono text-primary font-bold">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Presisi (0.0)</span>
                    <span>Default (0.75)</span>
                    <span>Kreatif (1.0)</span>
                  </div>
                </div>

                {/* Limits Grid */}
                <div className="pt-2 border-t border-border/60 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                        <span>Max Model Calls</span>
                        <span className="font-mono text-primary font-bold">{maxModelCalls}</span>
                      </Label>
                      <Input
                        type="number"
                        min={3}
                        max={35}
                        value={maxModelCalls}
                        onChange={(e) => setMaxModelCalls(Number(e.target.value))}
                        className="text-xs h-8"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                        <span>Max Tool Calls</span>
                        <span className="font-mono text-primary font-bold">{maxToolCalls}</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        value={maxToolCalls}
                        onChange={(e) => setMaxToolCalls(Number(e.target.value))}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                        <span>Timeout (detik)</span>
                        <span className="font-mono text-primary font-bold">{timeoutSeconds}s</span>
                      </Label>
                      <Input
                        type="number"
                        min={30}
                        max={480}
                        value={timeoutSeconds}
                        onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                        className="text-xs h-8"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                        <span>Target Min Kata</span>
                        <span className="font-mono text-primary font-bold">{minWordCount}</span>
                      </Label>
                      <Input
                        type="number"
                        min={300}
                        max={5000}
                        value={minWordCount}
                        onChange={(e) => setMinWordCount(Number(e.target.value))}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* 5. Action Card: Tombol Simpan & Batal (DI BAGIAN BAWAH SIDEBAR) */}
          <Card className="border-border bg-card shadow-xs">
            <CardContent className="p-4 space-y-3">
              <Button
                type="submit"
                disabled={isSaving}
                className="w-full gap-2 font-semibold shadow-xs"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Menyimpan Profil...</span>
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    <span>{isEditing ? "Simpan Perubahan Profil" : "Simpan Profil Agen"}</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => router.push("/agents")}
                className="w-full gap-2 text-xs"
              >
                <ArrowLeft className="size-3.5" />
                <span>Batal &amp; Kembali</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
