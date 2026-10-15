"use client"

import * as React from "react"
import Link from "next/link"
import { AlertCircle, CircleStop, Info, Loader2, Play, Sparkles, Timer, Wrench } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { Textarea } from "@/components/atoms/textarea"
import { FormField } from "@/components/molecules/form-field"
import { formatDuration, toToolOutcome } from "@/components/organisms/lab/lab-run"
import { LabToolResult } from "@/components/organisms/lab/lab-tool-result"
import { useLabRun } from "@/components/organisms/lab/use-lab-run"
import { errorMessage } from "@/lib/ui/notify"
import type { LabSiteOption, LabToolManifest } from "@/types/lab"

type ParamValues = Record<string, unknown>

function initialParams(tool: LabToolManifest): ParamValues {
  const values: ParamValues = { ...tool.defaultParams }
  for (const field of tool.inputFields) {
    if (field.defaultValue !== undefined && values[field.name] === undefined) values[field.name] = field.defaultValue
  }
  return values
}

interface LabToolFormProps {
  tool: LabToolManifest
  sites: LabSiteOption[]
  isRunning: boolean
  onRun: (siteId: string | undefined, params: ParamValues) => void
  onCancel: () => void
}

/** Form parameter satu tool; di-mount ulang (prop `key`) saat tool diganti sehingga nilai kembali ke default. */
function LabToolForm({ tool, sites, isRunning, onRun, onCancel }: LabToolFormProps) {
  const [params, setParams] = React.useState<ParamValues>(() => initialParams(tool))
  const [siteId, setSiteId] = React.useState(sites[0]?.id ?? "")
  const formId = React.useId()
  const missingSite = tool.requiresSite && !siteId

  function setParam(name: string, value: unknown) {
    setParams((current) => ({ ...current, [name]: value }))
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!missingSite) onRun(tool.requiresSite ? siteId : undefined, params)
      }}
    >
      <fieldset disabled={isRunning} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">Parameter uji {tool.name}</legend>
        {tool.requiresSite &&
          (sites.length === 0 ? (
            <Alert variant="warning">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>
                Tool ini membutuhkan website WordPress.{" "}
                <Link href="/sites" className="font-semibold underline underline-offset-2">
                  Hubungkan website
                </Link>{" "}
                terlebih dahulu.
              </AlertDescription>
            </Alert>
          ) : (
            <FormField id={`${formId}-site`} label="Target website WordPress" required>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger id={`${formId}-site`} className="w-full">
                  <SelectValue placeholder="Pilih situs WordPress…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.site_name} ({site.base_url})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FormField>
          ))}

        {tool.inputFields.length > 0 ? (
          <FieldGroup className="gap-3.5 border-t border-border/60 pt-3">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Parameter masukan</span>
            {tool.inputFields.map((field) => {
              const id = `${formId}-${field.name}`
              const value = params[field.name]
              const text = value === undefined || value === null ? "" : String(value)
              return (
                <FormField key={field.name} id={id} label={field.label} hint={field.description}>
                  {field.type === "select" ? (
                    <Select value={text} onValueChange={(next) => setParam(field.name, next)}>
                      <SelectTrigger id={id} className="w-full" aria-describedby={field.description ? `${id}-hint` : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {field.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : field.type === "textarea" ? (
                    <Textarea
                      id={id}
                      rows={4}
                      value={text}
                      placeholder={field.placeholder}
                      onChange={(event) => setParam(field.name, event.target.value)}
                      aria-describedby={field.description ? `${id}-hint` : undefined}
                      className="font-mono text-xs"
                    />
                  ) : (
                    <Input
                      id={id}
                      type={field.type === "number" ? "number" : "text"}
                      value={text}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setParam(
                          field.name,
                          field.type === "number" && event.target.value !== "" ? event.target.valueAsNumber : event.target.value
                        )
                      }
                      aria-describedby={field.description ? `${id}-hint` : undefined}
                    />
                  )}
                </FormField>
              )
            })}
          </FieldGroup>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            Tool ini tidak memerlukan parameter tambahan.
          </p>
        )}
      </fieldset>

      {isRunning ? (
        <Button type="button" variant="outline" className="w-full" onClick={onCancel}>
          <CircleStop aria-hidden="true" />
          Batalkan uji
        </Button>
      ) : (
        <Button type="submit" className="w-full font-semibold shadow-xs" disabled={missingSite}>
          <Play aria-hidden="true" />
          Jalankan {tool.name}
        </Button>
      )}
    </form>
  )
}

interface LabToolsRunnerProps {
  tools: LabToolManifest[]
  sites: LabSiteOption[]
}

/** Test bench Universal Tools: jalankan satu tool secara independen dan periksa `ToolOutcome`-nya. */
export function LabToolsRunner({ tools, sites }: LabToolsRunnerProps) {
  const [toolId, setToolId] = React.useState(tools[0]?.id ?? "")
  const tool = tools.find((item) => item.id === toolId) ?? tools[0]
  const { run, cancel, reset, payload, isRunning, isAborted, error } = useLabRun()
  const [ranToolId, setRanToolId] = React.useState<string | null>(null)
  const ranTool = tools.find((item) => item.id === ranToolId)
  const outcome = payload ? toToolOutcome(payload) : null

  if (!tool) {
    return (
      <Alert variant="info" role="note">
        <Info aria-hidden="true" />
        <AlertDescription>Belum ada tool yang terdaftar di ToolRegistry.</AlertDescription>
      </Alert>
    )
  }

  const handleRun = (siteId: string | undefined, params: ParamValues) => {
    setRanToolId(tool.id)
    run({ type: "tool", targetId: tool.id, siteId, params })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Card className="gap-4 py-5 lg:col-span-5">
        <CardHeader className="px-5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wrench aria-hidden="true" className="size-4 text-primary" />
            Test Bench Universal Tools
          </CardTitle>
          <CardDescription className="text-xs">Uji pemanggilan masing-masing tool secara independen.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-5">
          <FormField id="lab-tool-select" label="Pilih tool">
            <Select value={tool.id} onValueChange={setToolId} disabled={isRunning}>
              <SelectTrigger id="lab-tool-select" className="w-full">
                <SelectValue placeholder="Pilih tool…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tools.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FormField>
          <p className="rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs leading-relaxed text-muted-foreground">
            {tool.description}
          </p>
          <LabToolForm key={tool.id} tool={tool} sites={sites} isRunning={isRunning} onRun={handleRun} onCancel={cancel} />
        </CardContent>
      </Card>

      <Card className="gap-4 py-5 lg:col-span-7">
        <CardHeader className="flex flex-row items-start justify-between gap-2 px-5">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-sm">Hasil Eksekusi Tool</CardTitle>
            <CardDescription className="text-xs">Pratinjau visual dan payload JSON dari tool.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {outcome?.durationMs !== undefined && (
              <Badge variant="outline" className="font-mono">
                <Timer aria-hidden="true" />
                {formatDuration(outcome.durationMs)}
              </Badge>
            )}
            {outcome && (
              <Badge variant={outcome.ok ? "success" : "destructive"}>
                {outcome.ok ? "Berhasil" : "Gagal"}
              </Badge>
            )}
            {(outcome || isAborted || error) && !isRunning && (
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
              Menjalankan {ranTool?.name ?? "tool"}…
            </p>
          ) : isAborted ? (
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertDescription>Uji dibatalkan. Request ke server dihentikan.</AlertDescription>
            </Alert>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{errorMessage(error, "Uji Laboratorium gagal dijalankan.")}</AlertDescription>
            </Alert>
          ) : outcome && ranTool ? (
            <LabToolResult toolId={ranTool.id} toolName={ranTool.name} outcome={outcome} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/10 py-16 text-center text-muted-foreground">
              <Wrench aria-hidden="true" className="mb-1 size-8 stroke-[1.5] opacity-50" />
              <p className="text-xs font-medium">Belum ada eksekusi tool.</p>
              <p className="text-xs">Pilih tool lalu klik &quot;Jalankan&quot; untuk menguji fungsinya.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
