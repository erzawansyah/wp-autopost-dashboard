"use client"

import { useFormContext, useWatch } from "react-hook-form"
import { Sliders } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { AGENT_PROFILE_INPUT_BOUNDS } from "@/core/writer/types/profile"
import {
  AGENT_LIMIT_RANGES,
  DEFAULT_AGENT_TEMPERATURE,
  clampAgentLimit,
  defaultAgentLimits,
  type AgentLimitKey,
  type AgentProfileFormOutput,
  type AgentProfileFormValues,
} from "@/lib/validation/agents"

const LIMIT_FIELDS: ReadonlyArray<{ key: AgentLimitKey; label: string; unit?: string }> = [
  { key: "maxModelCalls", label: "Maks. panggilan model" },
  { key: "maxToolCalls", label: "Maks. panggilan tool" },
  { key: "timeoutSeconds", label: "Batas waktu", unit: "detik" },
  { key: "minWordCount", label: "Target minimal kata" },
]

/**
 * Temperatur & batas eksekusi. Rentang = batas sistem (`SYSTEM_LIMIT_BOUNDS`); saat fokus keluar nilai dijepit
 * persis seperti `clampLimits()` di server (kosong → default mode), jadi yang tampil = yang tersimpan.
 */
export function AgentLimitsSection() {
  const { control, setValue } = useFormContext<AgentProfileFormValues, unknown, AgentProfileFormOutput>()
  const [mode, temperature] = useWatch({ control, name: ["mode", "temperature"] })
  const modeDefaults = defaultAgentLimits(mode)
  const modeLabel = mode === "deep" ? "Deep" : "Standard"

  return (
    <Card className="gap-4 py-5 shadow-xs">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Sliders aria-hidden="true" className="size-3.5 text-primary" />
            Parameter &amp; Batas Runtime
          </span>
          <Badge variant="outline" className="font-mono text-2xs">
            Temp {Number(temperature).toFixed(2)}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Nilai di luar rentang otomatis dijepit ke batas sistem, sama seperti saat disimpan.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <FieldGroup className="gap-4">
          <ControlledField
            control={control}
            name="temperature"
            label="Temperatur kreativitas"
            hint={`Rentang ${AGENT_PROFILE_INPUT_BOUNDS.temperatureMin}–${AGENT_PROFILE_INPUT_BOUNDS.temperatureMax}; bawaan ${DEFAULT_AGENT_TEMPERATURE}. Makin tinggi makin variatif.`}
          >
            {({ value, onChange, ...field }) => (
              <input
                {...field}
                type="range"
                min={AGENT_PROFILE_INPUT_BOUNDS.temperatureMin}
                max={AGENT_PROFILE_INPUT_BOUNDS.temperatureMax}
                step={0.05}
                value={value}
                onChange={(event) => onChange(event.target.valueAsNumber)}
                aria-valuetext={Number(value).toFixed(2)}
                className="w-full cursor-pointer accent-primary"
              />
            )}
          </ControlledField>

          <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
            {LIMIT_FIELDS.map(({ key, label, unit }) => {
              const range = AGENT_LIMIT_RANGES[key]
              return (
                <ControlledField
                  key={key}
                  control={control}
                  name={`limits.${key}`}
                  label={unit ? `${label} (${unit})` : label}
                  hint={`${range.min}–${range.max}; default ${modeLabel}: ${modeDefaults[key]}`}
                >
                  {({ value, onChange, onBlur, ...field }) => (
                    <Input
                      {...field}
                      type="number"
                      inputMode="numeric"
                      min={range.min}
                      max={range.max}
                      step={1}
                      value={Number.isFinite(value) ? value : ""}
                      onChange={(event) => onChange(event.target.valueAsNumber)}
                      onBlur={() => {
                        setValue(`limits.${key}`, clampAgentLimit(key, value, mode), { shouldValidate: true })
                        onBlur()
                      }}
                      className="h-8 font-mono text-xs"
                    />
                  )}
                </ControlledField>
              )
            })}
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
