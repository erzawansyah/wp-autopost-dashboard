"use client"

import * as React from "react"
import { Clock, CalendarRange, Zap, Calendar } from "lucide-react"
import { Label } from "@/components/atoms/label"
import { Input } from "@/components/atoms/input"
import { Checkbox } from "@/components/atoms/checkbox"
import { Switch } from "@/components/atoms/switch"
import { PublishStatusSwitcher } from "@/components/molecules/publish-status-switcher"
import { cn } from "@/lib/utils"

export type ExecutionMode = "immediate" | "scheduled_drip"
export type ScheduleMode = "interval" | "random"

export interface ScheduleStrategyState {
  executionMode: ExecutionMode
  mode: ScheduleMode
  randomStartDate: string
  randomEndDate: string
  intervalStartDate: string
  intervalHours: number
  intervalJitter: boolean
  targetStatus: "publish" | "draft"
}

interface ScheduleStrategyPickerProps {
  value: ScheduleStrategyState
  onChange: (newValue: ScheduleStrategyState) => void
  itemCount?: number
  disabled?: boolean
  className?: string
}

export function ScheduleStrategyPicker({
  value,
  onChange,
  disabled = false,
  className,
}: ScheduleStrategyPickerProps) {
  const isImmediate = value.executionMode === "immediate"

  const updateField = <K extends keyof ScheduleStrategyState>(
    field: K,
    val: ScheduleStrategyState[K]
  ) => {
    onChange({
      ...value,
      [field]: val,
    })
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/15 p-3.5", className)}>
      {/* 1. Toggle Eksekusi Langsung vs Bertahap */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-md shrink-0",
              isImmediate
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Zap className="size-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground">
              Eksekusi Langsung (Tulis Semua Sekarang)
            </span>
            <span className="text-[11px] text-muted-foreground">
              {isImmediate
                ? "AI langsung menulis semua artikel hari ini di antrean. Tanggal di WordPress tetap sesuai jadwal."
                : "AI baru menulis artikel 10 menit sebelum jam tayang masing-masing."}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground">
            {isImmediate ? "Langsung" : "Bertahap"}
          </span>
          <Switch
            checked={isImmediate}
            onCheckedChange={(checked) =>
              updateField("executionMode", checked ? "immediate" : "scheduled_drip")
            }
            disabled={disabled}
            aria-label="Toggle Eksekusi Langsung"
          />
        </div>
      </div>

      {/* 2. Pemilih Pola Jadwal Tanggal (Pola Interval vs Rentang Acak) */}
      <div className="flex flex-col gap-2.5 pt-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-foreground">
            Pola Jadwal Tayang
          </Label>
          <div className="flex items-center rounded-md border border-border/80 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => updateField("mode", "interval")}
              disabled={disabled}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer select-none flex items-center gap-1.5",
                value.mode === "interval"
                  ? "bg-card text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="size-3" />
              <span>Pola Interval</span>
            </button>
            <button
              type="button"
              onClick={() => updateField("mode", "random")}
              disabled={disabled}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer select-none flex items-center gap-1.5",
                value.mode === "random"
                  ? "bg-card text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarRange className="size-3" />
              <span>Tanggal Acak</span>
            </button>
          </div>
        </div>

        {/* Input Konfigurasi Sesuai Pola yang Dipilih */}
        {value.mode === "interval" ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="interval-start" className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="size-3 text-primary shrink-0" />
                  <span>Waktu Mulai (Artikel Pertama)</span>
                </Label>
                <Input
                  id="interval-start"
                  type="datetime-local"
                  disabled={disabled}
                  value={value.intervalStartDate}
                  onChange={(e) => updateField("intervalStartDate", e.target.value)}
                  className="bg-background text-xs h-8 dark:[color-scheme:dark]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="interval-hours" className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3 text-primary shrink-0" />
                  <span>Jeda Antar Artikel</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="interval-hours"
                    type="number"
                    min={1}
                    max={720}
                    step={1}
                    disabled={disabled}
                    value={value.intervalHours}
                    onChange={(e) =>
                      updateField("intervalHours", Math.max(1, Number(e.target.value) || 1))
                    }
                    className="bg-background text-xs h-8"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">jam sekali</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <Checkbox
                id="interval-jitter"
                disabled={disabled}
                checked={value.intervalJitter}
                onCheckedChange={(checked) => updateField("intervalJitter", Boolean(checked))}
              />
              <Label
                htmlFor="interval-jitter"
                className="text-[11px] text-muted-foreground cursor-pointer select-none font-normal"
              >
                Variasi acak ±5-10 menit agar tidak selalu di menit :00
              </Label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="random-start" className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <CalendarRange className="size-3 text-primary shrink-0" />
                <span>Mulai Dari</span>
              </Label>
              <Input
                id="random-start"
                type="datetime-local"
                disabled={disabled}
                value={value.randomStartDate}
                onChange={(e) => updateField("randomStartDate", e.target.value)}
                className="bg-background text-xs h-8 dark:[color-scheme:dark]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="random-end" className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <CalendarRange className="size-3 text-primary shrink-0" />
                <span>Sampai Dengan</span>
              </Label>
              <Input
                id="random-end"
                type="datetime-local"
                disabled={disabled}
                value={value.randomEndDate}
                onChange={(e) => updateField("randomEndDate", e.target.value)}
                className="bg-background text-xs h-8 dark:[color-scheme:dark]"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Status WordPress */}
      <div className="pt-2 border-t border-border/60 flex flex-col gap-1.5">
        <PublishStatusSwitcher
          value={value.targetStatus}
          onChange={(newStatus) => updateField("targetStatus", newStatus)}
          disabled={disabled}
          label="Status di WordPress:"
          description={
            value.targetStatus === "publish"
              ? "Otomatis Terjadwal (future) jika tanggal di masa depan"
              : "Simpan sebagai Draf di WordPress"
          }
        />
      </div>
    </div>
  )
}
