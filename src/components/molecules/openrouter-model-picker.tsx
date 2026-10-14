"use client"

import * as React from "react"
import {
  OpenRouterModelInfo,
  FALLBACK_AI_MODELS,
  fetchDynamicAiModels,
  getModelDisplayName,
} from "@/lib/ai/settings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Badge } from "@/components/atoms/badge"
import {
  Bot,
  Check,
  ChevronsUpDown,
  Search,
  RefreshCw,
  Sparkles,
  Zap,
  Globe2,
  Wrench,
  Brain,
} from "lucide-react"

interface OpenrouterModelPickerProps {
  value: string
  onChange: (value: string) => void
  /** Kunci yang baru diketik & belum disimpan; tanpa ini server memakai kunci BYOK tersimpan. */
  unsavedKey?: string
  className?: string
}

const PROVIDER_FILTERS = [
  "Semua",
  "OpenAI",
  "Anthropic",
  "Google",
  "DeepSeek",
  "Meta",
  "Mistral",
  "Qwen",
]

export function OpenrouterModelPicker({
  value,
  onChange,
  unsavedKey,
  className,
}: OpenrouterModelPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [models, setModels] = React.useState<OpenRouterModelInfo[]>(FALLBACK_AI_MODELS)
  const [isLoading, setIsLoading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedProvider, setSelectedProvider] = React.useState("Semua")
  const [hasFetched, setHasFetched] = React.useState(false)

  const loadModels = React.useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    try {
      // Coba load dari sessionStorage jika tidak forceRefresh
      if (!forceRefresh && typeof window !== "undefined") {
        const cached = sessionStorage.getItem("openrouter_models_cache")
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            if (Array.isArray(parsed) && parsed.length > 0) {
              setModels(parsed)
              setIsLoading(false)
              setHasFetched(true)
              return
            }
          } catch {
            // cache corrupt, lanjutkan fetch
          }
        }
      }

      const fetched = await fetchDynamicAiModels({ unsavedKey })
      if (fetched && fetched.length > 0) {
        setModels(fetched)
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("openrouter_models_cache", JSON.stringify(fetched))
          } catch {
            // storage quota
          }
        }
      }
    } finally {
      setIsLoading(false)
      setHasFetched(true)
    }
  }, [unsavedKey])

  React.useEffect(() => {
    let ignore = false
    async function load() {
      if (!ignore) {
        await loadModels(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [loadModels])

  // Filter model berdasarkan pencarian dan provider
  const filteredModels = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return models.filter((m) => {
      const matchQuery =
        !q ||
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))

      if (!matchQuery) return false

      if (selectedProvider === "Semua") return true

      const pLower = selectedProvider.toLowerCase()
      if (pLower === "openai") return m.id.startsWith("openai/")
      if (pLower === "anthropic") return m.id.startsWith("anthropic/")
      if (pLower === "google") return m.id.startsWith("google/")
      if (pLower === "deepseek") return m.id.startsWith("deepseek/")
      if (pLower === "meta") return m.id.startsWith("meta-llama/") || m.id.startsWith("meta/")
      if (pLower === "mistral") return m.id.startsWith("mistralai/")
      if (pLower === "qwen") return m.id.startsWith("qwen/")

      return m.id.toLowerCase().includes(pLower)
    })
  }, [models, searchQuery, selectedProvider])

  const selectedModelInfo = React.useMemo(() => {
    return models.find((m) => m.id === value)
  }, [models, value])

  const formatContextLength = (length?: number) => {
    if (!length) return null
    if (length >= 1000000) return `${Math.round(length / 1000000)}M ctx`
    return `${Math.round(length / 1000)}k ctx`
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-10 px-3 justify-between bg-card hover:bg-muted/40 border-border text-xs font-normal"
          >
            <div className="flex items-center gap-2 truncate">
              <Bot className="size-4 shrink-0 text-primary" />
              <div className="flex items-center gap-2 truncate">
                <span className="font-medium text-foreground truncate">
                  {selectedModelInfo?.name || getModelDisplayName(value, models)}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground truncate">
                  ({value})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {selectedModelInfo?.context_length && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                  {formatContextLength(selectedModelInfo.context_length)}
                </Badge>
              )}
              <ChevronsUpDown className="size-3.5 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[min(calc(100vw-32px),620px)] p-0 bg-popover border-border shadow-lg"
        >
          {/* Header search & refresh */}
          <div className="p-3 border-b border-border space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari model OpenRouter (misal: gemini, claude, gpt-4o, deepseek)..."
                  className="h-8 pl-8 text-xs bg-muted/30 font-normal"
                  autoFocus
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadModels(true)}
                disabled={isLoading}
                title="Perbarui daftar model dari endpoint OpenRouter"
                className="h-8 px-2.5 text-xs shrink-0 cursor-pointer gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>

            {/* Provider Filter Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {PROVIDER_FILTERS.map((p) => {
                const isActive = selectedProvider === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedProvider(p)}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors shrink-0 cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary font-medium"
                        : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
              <div className="flex items-center gap-1.5">
                <Globe2 className="size-3 text-primary" />
                <span>
                  {isLoading
                    ? "Mengambil model dari OpenRouter endpoint..."
                    : `${filteredModels.length} model Tool-Ready (${models.length} total)`}
                </span>
              </div>
              {hasFetched && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <Zap className="size-3" />
                  Live Sync
                </span>
              )}
            </div>
          </div>

          {/* Model items scroll list */}
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {filteredModels.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-2">
                <p>Tidak ada model yang cocok dengan kata kunci &quot;{searchQuery}&quot;.</p>
                {searchQuery.trim().includes("/") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onChange(searchQuery.trim())
                      setOpen(false)
                    }}
                    className="text-xs h-7 gap-1.5"
                  >
                    <Sparkles className="size-3 text-primary" />
                    <span>Gunakan Model Kustom: &quot;{searchQuery.trim()}&quot;</span>
                  </Button>
                )}
              </div>
            ) : (
              filteredModels.map((m) => {
                const isSelected = value === m.id
                const providerName = m.id.split("/")[0] || ""

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m.id)
                      setOpen(false)
                    }}
                    className={`w-full text-left p-2 rounded-md transition-colors flex items-start justify-between gap-3 text-xs cursor-pointer ${
                      isSelected
                        ? "bg-primary/10 border border-primary/20 text-foreground"
                        : "hover:bg-muted/50 border border-transparent text-foreground"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">
                          {m.name}
                        </span>
                        {isSelected && (
                          <Badge className="bg-primary text-primary-foreground text-[10px] h-4 px-1 py-0">
                            Aktif
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                          {m.id}
                        </span>
                        {providerName && (
                          <span className="text-[10px] text-muted-foreground/80 px-1 py-0 rounded bg-muted/50 uppercase font-semibold">
                            {providerName}
                          </span>
                        )}
                        {m.supports_tools !== false && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1 rounded">
                            <Wrench className="size-2.5" />
                            Tools
                          </span>
                        )}
                        {m.supports_reasoning && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1 rounded">
                            <Brain className="size-2.5" />
                            Reasoning
                          </span>
                        )}
                      </div>
                      {m.description && (
                        <p className="text-[11px] text-muted-foreground/90 line-clamp-1 mt-1">
                          {m.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                      {m.context_length && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono">
                          {formatContextLength(m.context_length)}
                        </span>
                      )}
                      {isSelected && <Check className="size-4 text-primary mt-1" />}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer note */}
          <div className="p-2 border-t border-border bg-muted/10 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Daftar model diambil dinamis dari <code>openrouter.ai/api/v1/models</code></span>
            {searchQuery && !searchQuery.includes("/") && (
              <span className="text-[10px] italic">Ketik provider/model untuk model kustom</span>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
