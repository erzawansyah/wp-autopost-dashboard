"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useWatch } from "react-hook-form"
import { AlertCircle, Bot, BrainCircuit, CircleStop, Info, Loader2, Play, Settings2, Timer } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { LanguageSelect } from "@/components/molecules/language-select"
import { LabAgentRunResult } from "@/components/organisms/lab/lab-agent-run-result"
import { formatDuration, toAgentRun } from "@/components/organisms/lab/lab-run"
import { useLabRun } from "@/components/organisms/lab/use-lab-run"
import { getModelDisplayName } from "@/lib/ai/settings"
import { settingsQueries } from "@/lib/api/queries/settings"
import { useZodForm } from "@/lib/hooks/use-zod-form"
import { errorMessage } from "@/lib/ui/notify"
import { LAB_NO_SITE, LabAgentRunFormSchema, type LabAgentRunFormOutput } from "@/lib/validation/lab"
import type { UserSettings } from "@/types/settings"
import type { LabProfileManifest, LabSiteOption } from "@/types/lab"

const selectDefaultModel = (settings: UserSettings) => settings.defaultAiModel ?? null

/** Model default akun (server-backed `settingsQueries.user()`); run memakai model ini, lalu model Agent Profile. */
function ModelIndicator() {
  const { data: model, isPending } = useQuery({ ...settingsQueries.user(), select: selectDefaultModel })

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Bot aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        Model default akun:
        <strong className="truncate text-foreground">
          {isPending ? "memuat…" : model ? getModelDisplayName(model) : "belum diatur (model Agent Profile/sistem)"}
        </strong>
      </span>
      <Link href="/settings/keys#model-ai" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
        <Settings2 aria-hidden="true" className="size-3" />
        Ubah di Pengaturan
      </Link>
    </div>
  )
}

interface LabAgentProfileRunnerProps {
  profiles: LabProfileManifest[]
  sites: LabSiteOption[]
}

/** Uji Agent Profile end-to-end (riset → naskah → blok Gutenberg) dengan telemetri token, biaya, dan model. */
export function LabAgentProfileRunner({ profiles, sites }: LabAgentProfileRunnerProps) {
  const firstProfile = profiles[0]
  const form = useZodForm(LabAgentRunFormSchema, {
    defaultValues: {
      profileRef: firstProfile?.id ?? "",
      siteId: LAB_NO_SITE,
      language: "id",
      keyword: firstProfile?.defaultRequest.keyword ?? "",
      brief: firstProfile?.defaultRequest.brief ?? "",
    },
  })
  const profileRef = useWatch({ control: form.control, name: "profileRef" })
  const profile = profiles.find((item) => item.id === profileRef)
  const { run, cancel, reset, payload, isRunning, isAborted, error } = useLabRun()
  const agentRun = payload ? toAgentRun(payload) : null
  const presets = profiles.filter((item) => item.isPreset)
  const customProfiles = profiles.filter((item) => !item.isPreset)

  function handleRun(values: LabAgentRunFormOutput) {
    run({
      type: "agent",
      targetId: values.profileRef,
      siteId: values.siteId === LAB_NO_SITE ? undefined : values.siteId,
      params: { keyword: values.keyword, brief: values.brief ?? "", language: values.language, actionStatus: "draft" },
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Card className="gap-4 py-5 lg:col-span-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BrainCircuit aria-hidden="true" className="size-4 text-ai-process-strong" />
            Pengujian Agent Profile
          </CardTitle>
          <CardDescription className="text-xs">
            Jalankan alur kerja agen lengkap dari riset hingga blok Gutenberg (selalu draft).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5">
          <form noValidate onSubmit={form.handleSubmit(handleRun)} className="flex flex-col gap-4">
            <fieldset disabled={isRunning} className="flex min-w-0 flex-col gap-4">
              <legend className="sr-only">Parameter uji Agent Profile</legend>
              <FieldGroup className="gap-4">
                <ControlledField control={form.control} name="profileRef" label="Agent Profile" required>
                  {({ value, onChange, id, ...aria }) => (
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger
                        id={id}
                        className="w-full"
                        aria-invalid={aria["aria-invalid"]}
                        aria-describedby={aria["aria-describedby"]}
                      >
                        <SelectValue placeholder="Pilih Agent Profile…" />
                      </SelectTrigger>
                      <SelectContent>
                        {presets.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Preset bawaan</SelectLabel>
                            {presets.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {customProfiles.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Agent Profile kustom</SelectLabel>
                            {customProfiles.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </ControlledField>

                {profile && (
                  <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/15 p-2.5 text-xs">
                    <p className="leading-relaxed text-muted-foreground">{profile.description || "Tidak ada deskripsi."}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-2xs">
                        {profile.mode === "deep" ? "Deep Agent" : "Standard Agent"}
                      </Badge>
                      <Badge variant="secondary" className="text-2xs">
                        {profile.toolCount} tools
                      </Badge>
                      <Badge variant="secondary" className="text-2xs">
                        {profile.isPreset ? "Preset" : "Kustom"}
                      </Badge>
                    </div>
                  </div>
                )}

                <ModelIndicator />

                <ControlledField
                  control={form.control}
                  name="siteId"
                  label="Target website WordPress"
                  hint="Tanpa website: simulasi lokal (tanpa unggah media ke WordPress)."
                >
                  {({ value, onChange, id, ...aria }) => (
                    <Select value={value} onValueChange={onChange}>
                      <SelectTrigger
                        id={id}
                        className="w-full"
                        aria-invalid={aria["aria-invalid"]}
                        aria-describedby={aria["aria-describedby"]}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={LAB_NO_SITE}>Mode simulasi (tanpa WordPress)</SelectItem>
                          {sites.map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.site_name} ({site.base_url})
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </ControlledField>

                <ControlledField control={form.control} name="language" label="Bahasa artikel" required>
                  {({ value, onChange, id, ...aria }) => (
                    <LanguageSelect
                      id={id}
                      value={value}
                      onValueChange={onChange}
                      aria-invalid={aria["aria-invalid"]}
                      aria-describedby={aria["aria-describedby"]}
                      aria-required={aria["aria-required"]}
                      className="h-9 w-full bg-background text-xs"
                    />
                  )}
                </ControlledField>

                <ControlledField control={form.control} name="keyword" label="Kata kunci utama" required>
                  {(field) => <Input {...field} placeholder="mis. tips belajar coding" />}
                </ControlledField>

                <ControlledField control={form.control} name="brief" label="Brief / arahan konten">
                  {({ value, ...field }) => <Textarea {...field} value={value ?? ""} rows={2} placeholder="Arahan khusus…" />}
                </ControlledField>
              </FieldGroup>
            </fieldset>

            {isRunning ? (
              <Button type="button" variant="outline" className="w-full" onClick={cancel}>
                <CircleStop aria-hidden="true" />
                Batalkan run
              </Button>
            ) : (
              <Button type="submit" className="w-full font-semibold shadow-xs" disabled={profiles.length === 0}>
                <Play aria-hidden="true" />
                Jalankan Agent Profile
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4 py-5 lg:col-span-7">
        <CardHeader className="flex flex-row items-start justify-between gap-2 px-5">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-sm">Hasil Run Agent Profile</CardTitle>
            <CardDescription className="text-xs">Pratinjau naskah, blok Gutenberg, dan telemetri run.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {agentRun?.durationMs !== undefined && (
              <Badge variant="outline" className="font-mono">
                <Timer aria-hidden="true" />
                {formatDuration(agentRun.durationMs)}
              </Badge>
            )}
            {agentRun && (
              <Badge variant={agentRun.ok ? "success" : "destructive"}>
                {agentRun.ok ? "Selesai" : "Gagal"}
              </Badge>
            )}
            {(agentRun || isAborted || error) && !isRunning && (
              <Button variant="ghost" size="xs" onClick={reset}>
                Bersihkan
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-5" aria-live="polite">
          {isRunning ? (
            <p role="status" className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin text-primary motion-reduce:animate-none" />
              Agent Profile sedang menulis… meninggalkan halaman akan membatalkan run.
            </p>
          ) : isAborted ? (
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertDescription>Run dibatalkan. Server menghentikan agen sehingga token tidak terbuang.</AlertDescription>
            </Alert>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{errorMessage(error, "Uji Laboratorium gagal dijalankan.")}</AlertDescription>
            </Alert>
          ) : agentRun ? (
            <LabAgentRunResult run={agentRun} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/10 py-16 text-center text-muted-foreground">
              <BrainCircuit aria-hidden="true" className="mb-1 size-8 stroke-[1.5] opacity-50" />
              <p className="text-xs font-medium">Belum ada run Agent Profile.</p>
              <p className="text-xs">Klik &quot;Jalankan Agent Profile&quot; untuk menguji alur kerja secara menyeluruh.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
