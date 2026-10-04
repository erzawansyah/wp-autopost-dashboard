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
import {
  Bot,
  BrainCircuit,
  Sparkles,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Save,
  ArrowLeft,
  Loader2,
  Copy,
  Info,
  ShieldCheck,
  FileCode2,
  HelpCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip"

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

const TEMPLATES = [
  {
    name: "Template Quick Writer (1-Shot)",
    prompt: `Anda bertindak sebagai Penulis Konten Kreatif Cepat (1-Shot Content Generator).
Tugas Anda adalah menulis artikel yang komprehensif, mengalir alami, dan tuntas dalam sekali eksekusi tanpa memerlukan alat riset eksternal.

ALUR KERJA PENULISAN CEPAT:
1. Hook Pembuka Konkret:
   - Buka tulisan secara langsung dengan masalah nyata, fakta menarik, atau skenario praktis yang relevan dengan topik.
   - Hindari pembuka klise seperti definisi kamus umum atau basa-basi kosong.
2. Pengembangan Struktur Tematik (H2 & H3):
   - Rancang minimal 5 subbab deskriptif yang memiliki benang merah logis (misalnya: membedah masalah, analisis penyebab/faktor kunci, komparasi solusi, panduan langkah praktis, dan antisipasi kendala).
   - Setiap subbab wajib dikembangkan secara mendalam dengan beberapa paragraf penjelasan berbobot, contoh nyata, atau tips aplikatif.
3. Gaya Bahasa Alami & Mengalir:
   - Gunakan bahasa yang hidup, komunikatif, dan bervariasi dalam panjang kalimat agar nyaman dibaca.
   - Hindari formula klise AI dan jangan menggunakan subbab kaku seperti "Kesimpulan" atau "Penutup".
4. Penutup Berdampak:
   - Akhiri artikel dengan kesimpulan kontekstual, rekomendasi langkah konkret berikutnya, atau pandangan ke depan yang memberdayakan pembaca.`,
  },
  {
    name: "Template Research & Media Writer",
    prompt: `Anda bertindak sebagai Jurnalis Investigatif & Kurator Konten WordPress Profesional.
Anda memiliki kebebasan otonom untuk menggunakan tools yang tersedia guna menghasilkan artikel faktual, kaya data, dan berdaya tarik visual tinggi.

ALUR KERJA OTONOM:
1. Riset Data & Fakta Terkini:
   - Gunakan \`web_search\` dengan kata kunci pencarian yang spesifik untuk mencari data statistik terkini, regulasi resmi, studi kasus, atau kutipan pakar.
   - Jika menemukan artikel rujukan atau laporan yang sangat berbobot, gunakan \`web_reader\` untuk membaca intisari pembahasannya.
   - Formulasikan data riset langsung ke dalam kalimat naratif naskah (sebutkan nama lembaga/sumbernya secara alami).
2. Kurasi & Upload Media Visual:
   - Gunakan \`image_search\` dengan kata kunci visual dalam BAHASA INGGRIS (misal: "modern coffee laboratory", bukan judul artikel bahasa Indonesia) untuk menemukan foto berkualitas tinggi.
   - Unggah 1 foto utama paling relevan via \`upload_media\` dengan parameter \`isFeatured: true\` untuk dijadikan Featured Image artikel.
   - Cari dan unggah 1–2 foto tambahan via \`upload_media\` dengan parameter \`isFeatured: false\` untuk disematkan di dalam subbab naskah.
3. Penyusunan Naskah & Penyematan Gambar:
   - Rancang minimal 5 subbab tematik (H2/H3) yang membahas topik secara komprehensif dan faktual.
   - Sematkan foto subbab yang telah berhasil diunggah menggunakan format Markdown gambar resmi: \`![Keterangan Foto yang Deskriptif](URL_DARI_UPLOAD_MEDIA)\`.
4. Finalisasi Format:
   - Pastikan seluruh konten menggunakan Markdown murni dan kembalikan output JSON terstruktur lengkap dengan judul memikat dan kutipan ringkasan (excerpt).`,
  },
  {
    name: "Template Deep Research Agent",
    prompt: `Anda bertindak sebagai Senior Investigative Reporter & Managing Editor WordPress dengan kapabilitas penalaran bertahap (Deep Agent).
Tugas Anda adalah membedah topik secara multidimensi, melakukan verifikasi data silang, dan menghasilkan karya jurnalistik yang berbobot tinggi serta humanis.

ALUR KERJA INVESTIGATIF MENDALAM:
1. Perencanaan Investigasi (Planning):
   - Identifikasi pilar-pilar penting bahasan: latar belakang masalah, data riil lapangan, regulasi/kebijakan, perdebatan perspektif, dan implikasi solusi.
2. Investigasi Multi-Sudut Pandang:
   - Lakukan penelusuran bertahap menggunakan \`web_search\` untuk mengumpulkan bukti empiris, statistik industri, dan studi komparatif.
   - Gunakan \`web_reader\` untuk mendalami dokumen sumber primer, whitepaper, atau wawancara mendalam.
   - Lakukan verifikasi silang: jika terdapat klaim yang bertolak belakang, jelaskan kedua sudut pandang secara adil dan objektif.
3. Kurasi Media Editorial Berkualitas Tinggi:
   - Cari foto yang memiliki kekuatan visual jurnalistik via \`image_search\` (gunakan kata kunci visual bahasa Inggris).
   - Unggah foto utama via \`upload_media\` (\`isFeatured: true\`) sebagai Featured Image.
   - Unggah 1–2 foto subbab via \`upload_media\` (\`isFeatured: false\`) dan sematkan langsung di subbab terkait dengan format \`![Keterangan Foto](URL_DARI_UPLOAD_MEDIA)\`.
4. Penulisan Naskah Humanis & Mendalam:
   - Terapkan standar penulisan humanis (anti-ai-editor): variasi ritme kalimat tinggi, narasi kaya detail inderawi dan analogi tajam, tanpa pengulangan kata robotik.
   - Rancang minimal 5–7 subbab deskriptif yang mengalir tuntas.
   - Tutup artikel dengan analisis implikasi jangka panjang, prediksi tren, atau rekomendasi strategis yang aplikatif.`,
  },
]

export const BUILTIN_TOOL_IDS = new Set([
  "upload_media",
  "list_wp_categories",
  "list_wp_tags",
  "list_wp_authors",
  "list_categories",
  "list_tags",
  "list_authors",
])

export function AgentProfileEditor({ initialData, isEditing = false }: AgentProfileEditorProps) {
  const router = useRouter()

  // Form states
  const [name, setName] = React.useState(initialData?.name || "")
  const [description, setDescription] = React.useState(initialData?.description || "")
  const [mode, setMode] = React.useState<"standard" | "deep">(initialData?.mode || "standard")
  const [temperature, setTemperature] = React.useState(initialData?.temperature ?? 0.35)
  const [workflowPrompt, setWorkflowPrompt] = React.useState(initialData?.workflowPrompt || TEMPLATES[1].prompt)
  const [selectedToolIds, setSelectedToolIds] = React.useState<string[]>(() => {
    if (initialData?.toolIds) {
      return initialData.toolIds.filter((id) => !BUILTIN_TOOL_IDS.has(id))
    }
    return ["web_search", "image_search"]
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
        const [toolsRes, skillsRes] = await Promise.all([
          fetch("/api/agents/tools"),
          fetch("/api/skills"),
        ])
        if (toolsRes.ok) {
          const data = await toolsRes.json()
          setTools(data.tools || [])
        }
        if (skillsRes.ok) {
          const sData = await skillsRes.json()
          setAvailableSkills(sData.skills || [])
        }
      } catch (err) {
        console.error("Gagal memuat tools/skills:", err)
      } finally {
        setIsLoadingTools(false)
        setIsLoadingSkills(false)
      }
    }
    loadToolsAndSkills()
  }, [])

  const optionalTools = React.useMemo(
    () => tools.filter((tool) => !BUILTIN_TOOL_IDS.has(tool.id)),
    [tools]
  )

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

  const handleApplyTemplate = (tmpl: typeof TEMPLATES[0]) => {
    if (confirm(`Ganti alur kerja dengan "${tmpl.name}"?`)) {
      setWorkflowPrompt(tmpl.prompt)
    }
  }

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
      const finalToolIds = Array.from(
        new Set([...selectedToolIds, ...Array.from(BUILTIN_TOOL_IDS)])
      )

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

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal menyimpan profil agen")
      }

      router.push("/agents")
      router.refresh()
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Kesalahan sistem saat menyimpan")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl pb-12">
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 1. Pengaturan Dasar Profil */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span>Identitas & Mode Agen</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Tentukan nama, deskripsi, dan arsitektur eksekusi agen.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Nama Profil Agen" required hint="Beri nama yang mewakili peran agen ini.">
              <Input
                placeholder="Contoh: Investigative Tech Reporter"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSaving}
                className="text-xs"
              />
            </FormField>

            <FormField label="Deskripsi Singkat" hint="Ringkasan tugas atau niche artikel.">
              <Input
                placeholder="Contoh: Menulis artikel analisis teknologi dengan riset fakta web dan foto curated."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
                className="text-xs"
              />
            </FormField>
          </div>

          {/* Mode Selector */}
          <div className="pt-2">
            <Label className="text-xs font-semibold text-foreground mb-2 block">
              Arsitektur / Mode Runtime Agen
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                onClick={() => setMode("standard")}
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all",
                  mode === "standard"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-border/80 bg-card"
                )}
              >
                <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="size-4 text-foreground" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">Standard Agent</span>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      createAgent
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Arsitektur LangChain ReAct agent terpadu. Sangat cepat, hemat token, dan efisien untuk pemanggilan tools langsung.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setMode("deep")}
                className={cn(
                  "flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all",
                  mode === "deep"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-border/80 bg-card"
                )}
              >
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 text-primary">
                  <BrainCircuit className="size-4" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">Deep Agent</span>
                    <Badge variant="outline" className="text-[9px] font-mono border-primary/30 text-primary">
                      createDeepAgent
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Framework LangChain Deep Agents dengan Todo list planning, state backend, dan integrasi skill anti-ai-editor.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Seleksi Tools & Ketersediaan */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Wrench className="size-4 text-primary" />
                <span>Katalog Tools</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Pilih tools yang diizinkan untuk digunakan oleh agen ini selama proses riset dan penulisan artikel.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs font-mono">
              {selectedToolIds.length} Terpilih
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {isLoadingTools ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-xs">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Memeriksa ketersediaan tools...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {optionalTools.map((tool) => {
                const isSelected = selectedToolIds.includes(tool.id)
                return (
                  <div
                    key={tool.id}
                    onClick={() => handleToggleTool(tool.id)}
                    className={cn(
                      "flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isSelected
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:border-border/80 bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {tool.label}
                      </span>
                      <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">
                        {tool.id}
                      </code>
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

                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* Status Ketersediaan */}
                      {tool.isEligible ? (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="size-3" /> Siap
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                          <AlertTriangle className="size-3" /> {tool.blockedReason || "Perlu Konfigurasi"}
                        </span>
                      )}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent onClick
                        className="size-4 rounded border-border text-primary focus:ring-primary"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2b. Deep Agent Skills Selection (Hanya untuk Mode Deep) */}
      {mode === "deep" && (
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <FileCode2 className="size-4 text-primary" />
                  <span>Skill Tambahan Deep Agent (Skill Registry)</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Pilih pedoman keahlian (file SKILL.md) yang diinjeksikan ke Deep Agent runtime untuk memandu riset dan gaya editorial.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
                  <Link href="/skills" target="_blank">
                    <FileCode2 className="size-3.5 text-primary" />
                    <span>Buka Skill Registry</span>
                  </Link>
                </Button>
                <Badge variant="secondary" className="text-xs font-mono">
                  {selectedSkillSlugs.length} Skill Terpilih
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoadingSkills ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-xs">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Memuat registry skill...</span>
              </div>
            ) : availableSkills.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                Belum ada skill yang terdaftar di sistem. Kunjungi{" "}
                <Link href="/skills" className="text-primary hover:underline">
                  Skill Registry
                </Link>{" "}
                untuk mengunggah file SKILL.md.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableSkills.map((skill) => {
                  const isSelected = selectedSkillSlugs.includes(skill.slug)
                  return (
                    <div
                      key={skill.id}
                      onClick={() => handleToggleSkill(skill.slug)}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        isSelected
                          ? "border-primary/60 bg-primary/5"
                          : "border-border hover:border-border/80 bg-card"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate">{skill.name}</span>
                        {skill.is_system && (
                          <Badge variant="outline" className="text-[10px] py-0 h-4 border-primary/40 text-primary shrink-0">
                            Sistem
                          </Badge>
                        )}
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">
                          {skill.slug}
                        </code>
                        {skill.description && (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-foreground inline-flex items-center focus:outline-none shrink-0"
                                  aria-label={`Informasi tentang ${skill.name}`}
                                >
                                  <HelpCircle className="size-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs">
                                {skill.description}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="size-4 rounded border-border text-primary focus:ring-primary shrink-0"
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. Workflow Prompt Editor */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                <span>Alur Kerja & Panduan Penulisan (Workflow Prompt)</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Tulis instruksi langkah demi langkah bagaimana agen harus meriset, menyusun subbab, dan menggunakan tools.
              </CardDescription>
            </div>

            {/* Quick Templates */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground">Template:</span>
              {TEMPLATES.map((tmpl, idx) => (
                <Button
                  key={idx}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="text-[10px] h-7 px-2 font-mono gap-1"
                  onClick={() => handleApplyTemplate(tmpl)}
                >
                  <Copy className="size-2.5" />
                  <span>{tmpl.name.replace("Template ", "")}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Sistem Guardrail Otomatis:</strong> Anda tidak perlu mendikte larangan slop AI (seperti <em>&quot;jangan gunakan tanda pisah em-dash&quot;</em> atau <em>&quot;jangan gunakan kata klise&quot;</em>) di sini. Sistem System Writer telah mengunci pedoman kualitas editorial dan konversi blok Gutenberg secara mutlak di lapisan runtime.
            </p>
          </div>

          <Textarea
            rows={12}
            value={workflowPrompt}
            onChange={(e) => setWorkflowPrompt(e.target.value)}
            disabled={isSaving}
            className="font-mono text-xs leading-relaxed bg-background"
            placeholder="Tuliskan peran agen dan instruksi alur kerja bertahap..."
          />
        </CardContent>
      </Card>

      {/* 4. Batas Komputasi & Anti-Loop Limits */}
      <Card className="border-border bg-card shadow-xs">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            <span>Batas Eksekusi & Anti-Infinite Loop Guards</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Mencegah pengeluaran token berlebih atau agen terjebak pemanggilan tool berulang tanpa henti.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                <span>Max Model Calls</span>
                <span className="font-mono font-bold text-primary">{maxModelCalls}</span>
              </Label>
              <Input
                type="number"
                min={3}
                max={35}
                value={maxModelCalls}
                onChange={(e) => setMaxModelCalls(Number(e.target.value))}
                className="text-xs h-8"
              />
              <p className="text-[10px] text-muted-foreground">Batas LLM inference (3-35)</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                <span>Max Tool Calls</span>
                <span className="font-mono font-bold text-primary">{maxToolCalls}</span>
              </Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={maxToolCalls}
                onChange={(e) => setMaxToolCalls(Number(e.target.value))}
                className="text-xs h-8"
              />
              <p className="text-[10px] text-muted-foreground">Total pemanggilan tools (0-50)</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                <span>Timeout (Detik)</span>
                <span className="font-mono font-bold text-primary">{timeoutSeconds}s</span>
              </Label>
              <Input
                type="number"
                min={30}
                max={480}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                className="text-xs h-8"
              />
              <p className="text-[10px] text-muted-foreground">Batas waktu run (30-480s)</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                <span>Min Kata Artikel</span>
                <span className="font-mono font-bold text-primary">{minWordCount}</span>
              </Label>
              <Input
                type="number"
                min={300}
                max={5000}
                value={minWordCount}
                onChange={(e) => setMinWordCount(Number(e.target.value))}
                className="text-xs h-8"
              />
              <p className="text-[10px] text-muted-foreground">Target panjang teks (300-5000)</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border/60 flex items-center justify-between">
            <div>
              <Label className="text-xs font-semibold text-foreground">Jadikan Sebagai Profil Default</Label>
              <p className="text-[11px] text-muted-foreground">
                Profil ini akan otomatis terpilih di formulir Tulis Cepat dan Pembuatan Batch Artikel.
              </p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button asChild variant="outline" size="sm" type="button" className="gap-1.5">
          <Link href="/agents">
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke Katalog</span>
          </Link>
        </Button>

        <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5 shadow-xs">
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          <span>{isEditing ? "Simpan Perubahan" : "Buat Profil Agen"}</span>
        </Button>
      </div>
    </form>
  )
}
