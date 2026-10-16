"use client"

import * as React from "react"
import { Calendar, CalendarRange, Clock, Zap } from "lucide-react"
import { Checkbox } from "@/components/atoms/checkbox"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Switch } from "@/components/atoms/switch"
import { PublishStatusSwitcher } from "@/components/molecules/publish-status-switcher"
import { INTERVAL_JITTER_MAX_MINUTES, INTERVAL_JITTER_MIN_MINUTES } from "@/lib/scheduler/date-calculator"
import { cn } from "@/lib/utils"
import type { ScheduleStrategy } from "@/lib/validation/batches"

interface ScheduleStrategyPickerProps {
  value: ScheduleStrategy
  onChange: (value: ScheduleStrategy) => void
  disabled?: boolean
  className?: string
}

const MODES: Array<{ value: ScheduleStrategy["mode"]; label: string; icon: typeof Clock }> = [
  { value: "interval", label: "Pola Interval", icon: Clock },
  { value: "random", label: "Tanggal Acak", icon: CalendarRange },
]

/** Strategi jadwal batch: eksekusi langsung vs bertahap, pola interval/acak, dan status WordPress. */
export function ScheduleStrategyPicker({ value, onChange, disabled = false, className }: ScheduleStrategyPickerProps) {
  const ids = {
    immediate: React.useId(),
    intervalStart: React.useId(),
    intervalHours: React.useId(),
    jitter: React.useId(),
    randomStart: React.useId(),
    randomEnd: React.useId(),
  }
  const isImmediate = value.executionMode === "immediate"

  function update<K extends keyof ScheduleStrategy>(field: K, fieldValue: ScheduleStrategy[K]) {
    onChange({ ...value, [field]: fieldValue })
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/15 p-3.5", className)}>
      <div className="flex flex-col justify-between gap-2.5 border-b border-border/60 pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md",
              isImmediate ? "bg-warning/10 text-warning-strong" : "bg-muted text-muted-foreground"
            )}
          >
            <Zap className="size-3.5" />
          </span>
          <div className="flex flex-col">
            <Label htmlFor={ids.immediate} className="text-xs font-semibold text-foreground">
              Eksekusi langsung (tulis semua sekarang)
            </Label>
            <span id={`${ids.immediate}-hint`} className="text-xs text-muted-foreground">
              {isImmediate
                ? "AI langsung menulis semua artikel di antrean. Tanggal di WordPress tetap sesuai jadwal."
                : "AI baru menulis artikel 10 menit sebelum jam tayang masing-masing."}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            {isImmediate ? "Langsung" : "Bertahap"}
          </span>
          <Switch
            id={ids.immediate}
            checked={isImmediate}
            onCheckedChange={(checked) => update("executionMode", checked ? "immediate" : "scheduled_drip")}
            disabled={disabled}
            aria-describedby={`${ids.immediate}-hint`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">Pola jadwal tayang</span>
          <div role="group" aria-label="Pola jadwal tayang" className="flex items-center rounded-md border border-border/80 bg-muted/40 p-0.5">
            {MODES.map((mode) => {
              const Icon = mode.icon
              const active = value.mode === mode.value
              return (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update("mode", mode.value)}
                  disabled={disabled}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active ? "bg-card font-semibold text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon aria-hidden="true" className="size-3" />
                  {mode.label}
                </button>
              )
            })}
          </div>
        </div>

        {value.mode === "interval" ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={ids.intervalStart} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar aria-hidden="true" className="size-3 shrink-0 text-primary" />
                  Waktu mulai (artikel pertama)
                </Label>
                <Input
                  id={ids.intervalStart}
                  type="datetime-local"
                  disabled={disabled}
                  value={value.intervalStartDate}
                  onChange={(event) => update("intervalStartDate", event.target.value)}
                  className="h-8 bg-background text-xs dark:[color-scheme:dark]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={ids.intervalHours} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock aria-hidden="true" className="size-3 shrink-0 text-primary" />
                  Jeda antar artikel (jam)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={ids.intervalHours}
                    type="number"
                    min={1}
                    max={720}
                    step={1}
                    disabled={disabled}
                    value={value.intervalHours}
                    onChange={(event) =>
                      update("intervalHours", Math.min(720, Math.max(1, Math.round(Number(event.target.value)) || 1)))
                    }
                    className="h-8 bg-background text-xs"
                  />
                  <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground">
                    jam sekali
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <Checkbox
                id={ids.jitter}
                disabled={disabled}
                checked={value.intervalJitter}
                onCheckedChange={(checked) => update("intervalJitter", checked === true)}
              />
              <Label htmlFor={ids.jitter} className="cursor-pointer text-xs font-normal text-muted-foreground select-none">
                Variasi acak ±{INTERVAL_JITTER_MIN_MINUTES}–{INTERVAL_JITTER_MAX_MINUTES} menit (mulai artikel kedua) agar
                tidak selalu tepat di menit :00
              </Label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={ids.randomStart} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarRange aria-hidden="true" className="size-3 shrink-0 text-primary" />
                Mulai dari
              </Label>
              <Input
                id={ids.randomStart}
                type="datetime-local"
                disabled={disabled}
                value={value.randomStartDate}
                onChange={(event) => update("randomStartDate", event.target.value)}
                className="h-8 bg-background text-xs dark:[color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={ids.randomEnd} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarRange aria-hidden="true" className="size-3 shrink-0 text-primary" />
                Sampai dengan
              </Label>
              <Input
                id={ids.randomEnd}
                type="datetime-local"
                disabled={disabled}
                value={value.randomEndDate}
                onChange={(event) => update("randomEndDate", event.target.value)}
                className="h-8 bg-background text-xs dark:[color-scheme:dark]"
              />
            </div>
          </div>
        )}
      </div>

      <PublishStatusSwitcher
        value={value.targetStatus}
        onChange={(status) => update("targetStatus", status)}
        disabled={disabled}
        label="Status di WordPress:"
        description={
          value.targetStatus === "publish"
            ? "Otomatis terjadwal (future) jika tanggal di masa depan"
            : "Simpan sebagai draf di WordPress"
        }
        className="mt-1"
      />
    </div>
  )
}
