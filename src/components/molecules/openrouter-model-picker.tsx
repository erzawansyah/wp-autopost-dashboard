"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Bot, Brain, Check, ChevronsUpDown, Globe2, RefreshCw, Search, Sparkles, TriangleAlert, Wrench, Zap } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover"
import { FALLBACK_AI_MODELS, getModelDisplayName, type OpenRouterModelInfo } from "@/lib/ai/settings"
import { aiQueries } from "@/lib/api/queries/ai"
import { cn } from "@/lib/utils"

/** Filter provider → prefix ID model OpenRouter (`Semua` = tanpa filter). */
const PROVIDER_PREFIXES = {
  Semua: [],
  OpenAI: ["openai/"],
  Anthropic: ["anthropic/"],
  Google: ["google/"],
  DeepSeek: ["deepseek/"],
  Meta: ["meta-llama/", "meta/"],
  Mistral: ["mistralai/"],
  Qwen: ["qwen/"],
} as const satisfies Record<string, readonly string[]>

export type ModelProviderFilter = keyof typeof PROVIDER_PREFIXES

const PROVIDER_FILTERS = Object.keys(PROVIDER_PREFIXES) as ModelProviderFilter[]

/** Cocokkan model dengan kata kunci (ID, nama, deskripsi; tanpa beda huruf besar) dan filter provider. */
export function filterOpenRouterModels(
  models: OpenRouterModelInfo[],
  query: string,
  provider: ModelProviderFilter
): OpenRouterModelInfo[] {
  const q = query.toLowerCase().trim()
  const prefixes: readonly string[] = PROVIDER_PREFIXES[provider]
  return models.filter((model) => {
    const matchesQuery =
      !q ||
      model.id.toLowerCase().includes(q) ||
      model.name.toLowerCase().includes(q) ||
      Boolean(model.description?.toLowerCase().includes(q))
    return matchesQuery && (prefixes.length === 0 || prefixes.some((prefix) => model.id.startsWith(prefix)))
  })
}

/** Panjang konteks ringkas: `131072` → `131k ctx`, `1048576` → `1M ctx`. */
export function formatContextLength(length?: number): string | null {
  if (!length) return null
  if (length >= 1_000_000) return `${Math.round(length / 1_000_000)}M ctx`
  return `${Math.round(length / 1000)}k ctx`
}

interface OpenrouterModelPickerProps {
  value: string
  onChange: (value: string) => void
  /** `id` + aria dari `ControlledField`/`FormField` agar label & pesan error tersambung ke tombol pemilih. */
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  className?: string
}

/**
 * Pemilih model OpenRouter (katalog Tool-Ready dari `/api/ai/models`, cache TanStack Query 1 jam). Gagal memuat
 * → daftar cadangan `FALLBACK_AI_MODELS`. ID kustom berformat `provider/model` dapat dipakai langsung.
 */
export function OpenrouterModelPicker({ value, onChange, id, className, ...aria }: OpenrouterModelPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [provider, setProvider] = React.useState<ModelProviderFilter>("Semua")
  const { data, isFetching, isError, refetch } = useQuery(aiQueries.models())

  const isLive = Boolean(data && data.length > 0)
  const models = data && data.length > 0 ? data : FALLBACK_AI_MODELS
  const filteredModels = React.useMemo(
    () => filterOpenRouterModels(models, searchQuery, provider),
    [models, searchQuery, provider]
  )
  const selectedModel = models.find((model) => model.id === value)
  const selectedContext = formatContextLength(selectedModel?.context_length)
  const customModelId = searchQuery.trim()

  function selectModel(modelId: string) {
    onChange(modelId)
    setOpen(false)
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={aria["aria-invalid"]}
            aria-describedby={aria["aria-describedby"]}
            className="h-10 w-full cursor-pointer justify-between bg-card px-3 text-xs font-normal hover:bg-muted/40"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Bot aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span className="truncate font-medium text-foreground">
                {selectedModel?.name || getModelDisplayName(value, models)}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">({value})</span>
            </span>
            <span className="ml-2 flex shrink-0 items-center gap-1.5">
              {selectedContext && (
                <Badge variant="outline" className="h-5 px-1.5 font-mono text-2xs font-normal">
                  {selectedContext}
                </Badge>
              )}
              <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" sideOffset={6} className="w-[min(calc(100vw-32px),620px)] p-0 shadow-lg">
          <div className="flex flex-col gap-2.5 border-b border-border p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  aria-label="Cari model OpenRouter"
                  placeholder="Cari model OpenRouter (misal: gemini, claude, gpt-4o, deepseek)..."
                  className="h-8 bg-muted/30 pl-8 text-xs font-normal"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Perbarui daftar model dari OpenRouter"
                className="h-8 shrink-0 cursor-pointer gap-1.5 px-2.5 text-xs"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-3.5", isFetching && "animate-spin motion-reduce:animate-none")}
                />
                <span className="hidden sm:inline">Perbarui</span>
              </Button>
            </div>

            <div role="group" aria-label="Filter provider model" className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {PROVIDER_FILTERS.map((item) => {
                const isActive = provider === item
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setProvider(item)}
                    className={cn(
                      "shrink-0 cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      isActive
                        ? "border-primary bg-primary font-medium text-primary-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {item}
                  </button>
                )
              })}
            </div>

            <div role="status" className="flex items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {isError && !isLive ? (
                  <TriangleAlert aria-hidden="true" className="size-3 text-warning-strong" />
                ) : (
                  <Globe2 aria-hidden="true" className="size-3 text-primary" />
                )}
                {isFetching
                  ? "Mengambil model dari OpenRouter..."
                  : isError && !isLive
                    ? "Katalog OpenRouter gagal dimuat — memakai daftar cadangan."
                    : `${filteredModels.length} model Tool-Ready (${models.length} total)`}
              </span>
              {isLive && (
                <span className="flex items-center gap-1 font-medium text-success-strong">
                  <Zap aria-hidden="true" className="size-3" />
                  Live Sync
                </span>
              )}
            </div>
          </div>

          <div role="group" aria-label="Daftar model" className="flex max-h-72 flex-col gap-1 overflow-y-auto p-1.5">
            {filteredModels.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                <p>Tidak ada model yang cocok dengan kata kunci &quot;{searchQuery}&quot;.</p>
                {customModelId.includes("/") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectModel(customModelId)}
                    className="h-7 cursor-pointer gap-1.5 text-xs"
                  >
                    <Sparkles aria-hidden="true" className="size-3 text-primary" />
                    <span>Gunakan Model Kustom: &quot;{customModelId}&quot;</span>
                  </Button>
                )}
              </div>
            ) : (
              filteredModels.map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={model.id === value}
                  onSelect={() => selectModel(model.id)}
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/10 p-2 text-xs text-muted-foreground">
            <span>
              Daftar model diambil dinamis dari <code>openrouter.ai/api/v1/models</code>
            </span>
            {searchQuery && !searchQuery.includes("/") && (
              <span className="italic">Ketik provider/model untuk model kustom</span>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ModelOption({
  model,
  isSelected,
  onSelect,
}: {
  model: OpenRouterModelInfo
  isSelected: boolean
  onSelect: () => void
}) {
  const providerName = model.id.split("/")[0] || ""
  const context = formatContextLength(model.context_length)

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-start justify-between gap-3 rounded-md border p-2 text-left text-xs text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isSelected ? "border-primary/20 bg-primary/10" : "border-transparent hover:bg-muted/50"
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{model.name}</span>
          {isSelected && <Badge className="h-4 px-1 py-0 text-2xs">Aktif</Badge>}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="max-w-52 truncate font-mono text-xs text-muted-foreground">{model.id}</span>
          {providerName && (
            <span className="rounded bg-muted/50 px-1 text-2xs font-semibold text-muted-foreground uppercase">
              {providerName}
            </span>
          )}
          {model.supports_tools !== false && (
            <span className="inline-flex items-center gap-0.5 rounded bg-success/10 px-1 text-2xs font-medium text-success-strong">
              <Wrench aria-hidden="true" className="size-2.5" />
              Tools
            </span>
          )}
          {model.supports_reasoning && (
            <span className="inline-flex items-center gap-0.5 rounded bg-warning/10 px-1 text-2xs font-medium text-warning-strong">
              <Brain aria-hidden="true" className="size-2.5" />
              Reasoning
            </span>
          )}
        </span>
        {model.description && <span className="line-clamp-1 text-xs text-muted-foreground">{model.description}</span>}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
        {context && (
          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">{context}</span>
        )}
        {isSelected && <Check aria-hidden="true" className="mt-1 size-4 text-primary" />}
      </span>
    </button>
  )
}
