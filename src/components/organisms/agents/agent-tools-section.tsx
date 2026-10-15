"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useController, useFormContext } from "react-hook-form"
import { AlertCircle, AlertTriangle, CheckCircle2, RotateCw, Wrench } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card"
import { Checkbox } from "@/components/atoms/checkbox"
import { FieldError, FieldLegend, FieldSet } from "@/components/atoms/field"
import { Label } from "@/components/atoms/label"
import { Skeleton } from "@/components/atoms/skeleton"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import { firstErrorMessage } from "@/components/organisms/agents/form-error"
import { agentsQueries } from "@/lib/api/queries/agents"
import type { AgentProfileFormOutput, AgentProfileFormValues } from "@/lib/validation/agents"

/** Pilihan Universal Tools dari ToolRegistry (`/api/agents/tools`) beserta status kesiapan kunci BYOK. */
export function AgentToolsSection() {
  const { control } = useFormContext<AgentProfileFormValues, unknown, AgentProfileFormOutput>()
  const { field, fieldState } = useController({ control, name: "toolIds" })
  const { data: tools, isPending, error, refetch, isRefetching } = useQuery(agentsQueries.tools())
  const errorId = React.useId()
  const errorMessage = firstErrorMessage(fieldState.error)
  const selected = new Set(field.value)

  function toggleTool(toolId: string, checked: boolean) {
    field.onChange(checked ? [...field.value, toolId] : field.value.filter((id) => id !== toolId))
  }

  return (
    <Card className="gap-4 py-5 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wrench aria-hidden="true" className="size-3.5 text-primary" />
          Universal Tools
        </CardTitle>
        <Badge variant="secondary" className="font-mono">
          {selected.size} terpilih
        </Badge>
      </CardHeader>
      <CardContent className="px-5">
        <FieldSet className="gap-2" aria-describedby={errorMessage ? errorId : undefined}>
          <FieldLegend className="sr-only">Tools yang diizinkan untuk Agent Profile ini</FieldLegend>
          {isPending ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Memeriksa tools">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span>Gagal memuat katalog tools.</span>
                <Button type="button" size="xs" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                  <RotateCw aria-hidden="true" />
                  Coba lagi
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col gap-2">
              {tools.map((tool) => {
                const checkboxId = `tool-${tool.id}`
                return (
                  <li
                    key={tool.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 transition-colors has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={selected.has(tool.id)}
                      onCheckedChange={(checked) => toggleTool(tool.id, checked === true)}
                      onBlur={field.onBlur}
                    />
                    <Label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer truncate text-xs font-semibold">
                      {tool.label}
                    </Label>
                    <HelpTooltip content={tool.description} />
                    {tool.isEligible ? (
                      <Badge variant="success" className="text-2xs">
                        <CheckCircle2 aria-hidden="true" />
                        Siap
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="text-2xs" title={tool.blockedReason ?? undefined}>
                        <AlertTriangle aria-hidden="true" />
                        Perlu konfigurasi
                        {tool.blockedReason && <span className="sr-only">: {tool.blockedReason}</span>}
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {errorMessage && (
            <FieldError id={errorId} className="text-xs font-medium">
              {errorMessage}
            </FieldError>
          )}
        </FieldSet>
      </CardContent>
    </Card>
  )
}
