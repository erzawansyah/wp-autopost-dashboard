"use client"

import type { Control } from "react-hook-form"
import { Activity, Bot, Image as ImageIcon, Info, Search } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Input } from "@/components/atoms/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { ControlledField } from "@/components/molecules/controlled-field"
import { OpenrouterModelPicker } from "@/components/molecules/openrouter-model-picker"
import { apiFetch } from "@/lib/api/client"
import type { ApiKeysFormValues, SearchProvider, SearchTestProvider } from "@/lib/validation/settings"
import type { UserSettings } from "@/types/settings"
import { describeOpenRouterCheck } from "./api-keys-form-values"
import { ByokKeyField, type KeyTester, type KeyTestOutcome } from "./byok-key-field"
import { ReasoningEffortField } from "./reasoning-effort-field"
import { SettingsSection } from "./settings-section"

/** Bagian-bagian form Pusat Kunci API (`/settings/keys`); state form & simpan ada di `ApiKeysForm`. */

interface SectionProps {
  control: Control<ApiKeysFormValues>
  keys: UserSettings["keys"]
}

/** OpenRouter: kunci yang diketik, atau kunci BYOK tersimpan bila kosong (server tidak pernah menguji kunci platform). */
const openRouterTester: KeyTester = {
  storedKeyFallback: true,
  run: async (typedKey) => {
    const startedAt = performance.now()
    const summary = await apiFetch<{ limit?: number | null; usage?: number }>("/api/ai/test", {
      method: "POST",
      body: typedKey ? { apiKey: typedKey } : {},
    })
    return { message: describeOpenRouterCheck(summary), latencyMs: Math.round(performance.now() - startedAt) }
  },
}

/** Tavily/Brave/Pexafy hanya menguji kunci yang sedang diketik (belum disimpan). */
function searchKeyTester(provider: Exclude<SearchTestProvider, "searxng">): KeyTester {
  return {
    run: (typedKey) =>
      apiFetch<KeyTestOutcome>("/api/settings/search/test", { method: "POST", body: { provider, apiKey: typedKey } }),
  }
}

const tavilyTester = searchKeyTester("tavily")
const braveTester = searchKeyTester("brave")
const pexafyTester = searchKeyTester("pexafy")

/**
 * Label seluruh provider yang didukung `webSearch()`. Bertipe `Record<SearchProvider, string>` agar tsc gagal bila
 * union provider berubah tanpa memperbarui daftar ini, sehingga nilai tersimpan apa pun selalu punya opsi di Select.
 */
const SEARCH_PROVIDER_LABELS: Record<SearchProvider, string> = {
  auto: "Auto Cascade (Utamakan Kunci API Pribadi ➔ Fallback Cerdas)",
  tavily: "Tavily Search (Gunakan API Key Pribadi)",
  brave: "Brave Search (Gunakan API Key Pribadi)",
  serpapi: "SerpAPI / Google (Butuh API Key SerpAPI Tersimpan)",
  searxng: "SearXNG (Metasearch Tanpa Kuota API)",
  bing_scraper: "Bing Web (Tanpa API Key, Cadangan Wikipedia)",
  open_knowledge: "Wikipedia / Basis Pengetahuan Terbuka (Tanpa API Key)",
}

const SEARCH_PROVIDER_OPTIONS = Object.entries(SEARCH_PROVIDER_LABELS) as [SearchProvider, string][]

export function AiProviderSection({ control, keys }: SectionProps) {
  return (
    <SettingsSection
      id="model-ai"
      icon={Bot}
      iconClassName="text-ai-process"
      title="1. Provider Model AI (OpenRouter Gateway)"
      description="OpenRouter menghubungkan ratusan model LLM mutakhir (Claude, GPT-4o, DeepSeek, Gemini) melalui satu gerbang API terpadu."
      action={<Badge variant="outline">Wajib (BYOK)</Badge>}
    >
      <ByokKeyField
        control={control}
        name="openrouterKey"
        title="OpenRouter"
        configured={keys.openrouter.configured}
        placeholder="sk-or-v1-..."
        signup={{ href: "https://openrouter.ai/keys", label: "Daftar / Buat Kunci" }}
        test={openRouterTester}
      />

      <ControlledField
        control={control}
        name="defaultAiModel"
        label="Model Default Penulisan Artikel"
        hint="Dipakai otomatis oleh Agent Profile yang tidak menentukan model khusus (Quick Writer, Batch Queue, Lab)."
        tooltip="Daftar diambil dinamis dari OpenRouter (hanya model Tool-Ready yang mendukung tool calling). Ketik provider/model untuk memakai model kustom."
      >
        {({ value, onChange, id, ...field }) => (
          <OpenrouterModelPicker
            id={id}
            value={value}
            onChange={onChange}
            aria-invalid={field["aria-invalid"]}
            aria-describedby={field["aria-describedby"]}
          />
        )}
      </ControlledField>

      <ReasoningEffortField control={control} />
    </SettingsSection>
  )
}

export function SearchProviderSection({ control, keys }: SectionProps) {
  return (
    <SettingsSection
      icon={Search}
      title="2. Mesin Pencari Web & Riset Fakta (Web Search BYOK)"
      description="Dipakai Agent Profile untuk mencari referensi terkini, statistik akurat, dan validasi data agar naskah artikel bebas halusinasi."
      action={<Badge variant="outline">Multi-Provider</Badge>}
    >
      <ControlledField
        control={control}
        name="defaultSearchProvider"
        label="Mode Pemilihan Mesin Pencari Utama"
        hint="Pilih mesin pencari prioritas untuk riset artikel atau gunakan mode rekomendasi cerdas otomatis."
      >
        {({ value, onChange, id, ...field }) => (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger
              id={id}
              aria-invalid={field["aria-invalid"]}
              aria-describedby={field["aria-describedby"]}
              className="w-full text-xs"
            >
              <SelectValue placeholder="Pilih provider default" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SEARCH_PROVIDER_OPTIONS.map(([provider, label]) => (
                  <SelectItem key={provider} value={provider} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </ControlledField>

      <ByokKeyField
        control={control}
        name="tavilyKey"
        title="Tavily Search"
        configured={keys.tavily.configured}
        placeholder="tvly-..."
        signup={{ href: "https://tavily.com", label: "1.000 pencarian gratis/bulan" }}
        test={tavilyTester}
      />
      <ByokKeyField
        control={control}
        name="braveKey"
        title="Brave Search"
        configured={keys.brave.configured}
        placeholder="BSA..."
        signup={{ href: "https://brave.com/search/api/", label: "2.000 kueri gratis/bulan" }}
        test={braveTester}
      />
    </SettingsSection>
  )
}

export function ImageProviderSection({ control, keys }: SectionProps) {
  return (
    <SettingsSection
      icon={ImageIcon}
      title="3. Penyedia Foto Bebas Royalti (Stock Photos & Media)"
      description="Mencari foto landscape berkualitas tinggi (lebar minimal 1280px) untuk featured image artikel otomatis."
      action={<Badge variant="outline">Opsional</Badge>}
    >
      <ByokKeyField
        control={control}
        name="pexafyKey"
        title="Pexafy"
        configured={keys.pexafy.configured}
        placeholder="pxf_..."
        description="Pexafy mengindeks 9 juta+ foto bebas royalti dari berbagai pustaka foto komersial dalam satu integrasi semantik."
        signup={{ href: "https://pexafy.com/dashboard/api-keys", label: "Daftar Pexafy API" }}
        test={pexafyTester}
      />

      <Alert variant="info" role="note">
        <Info aria-hidden="true" />
        <AlertTitle>Alur Pipeline Bertingkat Pencarian Gambar</AlertTitle>
        <AlertDescription>
          Sistem memprioritaskan kunci API resmi (Pexafy). Jika kunci tidak diisi atau kuota habis, sistem otomatis
          melanjutkan ke metasearch dan katalog kurasi bebas royalti — artikel tetap mendapat gambar berkualitas meski
          API Key belum diisi.
        </AlertDescription>
      </Alert>
    </SettingsSection>
  )
}

export function ObservabilitySection({ control, keys }: SectionProps) {
  return (
    <SettingsSection
      icon={Activity}
      title="4. Observabilitas & Tracing Agen (LangSmith)"
      description="Pantau setiap langkah agen, pemanggilan tools, penalaran model, dan grafik eksekusi Deep Agents secara real-time di dasbor LangSmith."
      action={<Badge variant="outline">Opsional</Badge>}
    >
      <ByokKeyField
        control={control}
        name="langsmithApiKey"
        title="LangSmith"
        configured={keys.langsmith.configured}
        placeholder="lsv2_pt_..."
        description="Trace hanya dikirim ke proyek LangSmith milik akun Anda sendiri."
        signup={{ href: "https://smith.langchain.com", label: "Buka LangSmith" }}
      />

      <ControlledField
        control={control}
        name="langsmithProject"
        label="Nama Proyek LangSmith"
        hint="Semua run Agent Profile & Deep Agents dikelompokkan ke proyek ini di akun LangSmith Anda. Default: panitera."
      >
        {(field) => <Input {...field} type="text" autoComplete="off" placeholder="panitera" className="font-mono text-xs" />}
      </ControlledField>
    </SettingsSection>
  )
}
