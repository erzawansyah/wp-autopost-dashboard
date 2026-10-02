"use client"

import * as React from "react"
import { CalendarRange, Clock, Zap, Shuffle, Info } from "lucide-react"
import { Label } from "@/components/atoms/label"
import { Input } from "@/components/atoms/input"
import { Checkbox } from "@/components/atoms/checkbox"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import { cn } from "@/lib/utils"

export type ScheduleMode = "random" | "interval" | "instant"

export interface ScheduleStrategyState {
  mode: ScheduleMode
  randomStartDate: string
  randomEndDate: string
  intervalStartDate: string
  intervalHours: number
  intervalJitter: boolean
  instantStatus: "publish" | "draft"
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
  itemCount = 0,
  disabled = false,
  className,
}: ScheduleStrategyPickerProps) {
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
    <div className={cn("flex flex-col gap-4", className)}>
      {/* 1. Pemilih Mode Strategi (3 Kartu Pilihan) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Opsi 1: Tanggal Acak */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => updateField("mode", "random")}
          className={cn(
            "flex flex-col items-start gap-2.5 rounded-lg border p-3.5 text-left transition-all cursor-pointer",
            value.mode === "random"
              ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-2xs"
              : "border-border/70 bg-card hover:border-border hover:bg-muted/30"
          )}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-md",
                  value.mode === "random"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Shuffle className="size-3.5" />
              </div>
              <span className="font-semibold text-xs text-foreground">Tanggal Acak</span>
            </div>
            {value.mode === "random" && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                Aktif
              </span>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Sebarkan tanggal posting secara acak merata di dalam rentang waktu yang ditentukan.
          </p>
        </button>

        {/* Opsi 2: Pola Interval */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => updateField("mode", "interval")}
          className={cn(
            "flex flex-col items-start gap-2.5 rounded-lg border p-3.5 text-left transition-all cursor-pointer",
            value.mode === "interval"
              ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-2xs"
              : "border-border/70 bg-card hover:border-border hover:bg-muted/30"
          )}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-md",
                  value.mode === "interval"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Clock className="size-3.5" />
              </div>
              <span className="font-semibold text-xs text-foreground">Pola Interval</span>
            </div>
            {value.mode === "interval" && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                Aktif
              </span>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Posting bertahap setiap sekian jam sekali (contoh: 6 jam, 12 jam, atau 32 jam sekali).
          </p>
        </button>

        {/* Opsi 3: Instan Hari Ini */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => updateField("mode", "instant")}
          className={cn(
            "flex flex-col items-start gap-2.5 rounded-lg border p-3.5 text-left transition-all cursor-pointer",
            value.mode === "instant"
              ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-2xs"
              : "border-border/70 bg-card hover:border-border hover:bg-muted/30"
          )}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-md",
                  value.mode === "instant"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <Zap className="size-3.5" />
              </div>
              <span className="font-semibold text-xs text-foreground">Instan Hari Ini</span>
            </div>
            {value.mode === "instant" && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
                Aktif
              </span>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Seluruh artikel diproses dan dikirim ke WordPress pada hari yang sama.
          </p>
        </button>
      </div>

      {/* 2. Form Input Konfigurasi Detail Berdasarkan Mode yang Dipilih */}
      <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
        {value.mode === "random" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <CalendarRange className="size-3.5 text-primary" />
              <span>Rentang Waktu Tanggal Acak</span>
              <HelpTooltip content="Sistem akan menyebarkan seluruh artikel secara seimbang dan acak di antara rentang waktu ini, lengkap dengan variasi acak menit agar tidak kaku." />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="random-start" className="text-xs text-muted-foreground">
                  Dari Tanggal &amp; Jam Mulai
                </Label>
                <Input
                  id="random-start"
                  type="datetime-local"
                  disabled={disabled}
                  value={value.randomStartDate}
                  onChange={(e) => updateField("randomStartDate", e.target.value)}
                  className="bg-background text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="random-end" className="text-xs text-muted-foreground">
                  Sampai Tanggal &amp; Jam Selesai
                </Label>
                <Input
                  id="random-end"
                  type="datetime-local"
                  disabled={disabled}
                  value={value.randomEndDate}
                  onChange={(e) => updateField("randomEndDate", e.target.value)}
                  className="bg-background text-xs"
                />
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="size-3 text-primary shrink-0" />
              <span>
                {itemCount > 0 ? (
                  <>
                    Sebanyak <strong>{itemCount} artikel</strong> akan disebar acak merata di dalam rentang waktu ini.
                  </>
                ) : (
                  "Waktu setiap artikel akan dihitung otomatis saat daftar kata kunci diisi."
                )}
              </span>
            </p>
          </div>
        )}

        {value.mode === "interval" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Clock className="size-3.5 text-primary" />
              <span>Pola Interval Jam &amp; Waktu Mulai</span>
              <HelpTooltip content="Setiap artikel berikutnya akan dijadwalkan tepat setelah interval jam yang Anda tentukan (misalnya: artikel #1 mulai sekarang, artikel #2 setelah 32 jam, artikel #3 setelah 64 jam, dst)." />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="interval-start" className="text-xs text-muted-foreground">
                  Mulai Kapan (Artikel Pertama)
                </Label>
                <Input
                  id="interval-start"
                  type="datetime-local"
                  disabled={disabled}
                  value={value.intervalStartDate}
                  onChange={(e) => updateField("intervalStartDate", e.target.value)}
                  className="bg-background text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="interval-hours" className="text-xs text-muted-foreground">
                    Interval Waktu (Berapa Jam Sekali)
                  </Label>
                  <span className="font-mono text-[11px] font-semibold text-primary">
                    Setiap {value.intervalHours} jam
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="interval-hours"
                    type="number"
                    min={1}
                    max={720}
                    step={1}
                    disabled={disabled}
                    value={value.intervalHours}
                    onChange={(e) => updateField("intervalHours", Math.max(1, Number(e.target.value) || 1))}
                    className="bg-background text-xs"
                    placeholder="Contoh: 32"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">jam sekali</span>
                </div>
              </div>
            </div>

            {/* Checkbox Minute Jitter */}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="interval-jitter"
                disabled={disabled}
                checked={value.intervalJitter}
                onCheckedChange={(checked) => updateField("intervalJitter", Boolean(checked))}
              />
              <Label
                htmlFor="interval-jitter"
                className="text-xs text-muted-foreground cursor-pointer select-none font-normal"
              >
                Tambahkan variasi acak (±5-10 menit) agar jam tayang tidak selalu kaku di menit :00
              </Label>
            </div>
          </div>
        )}

        {value.mode === "instant" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Zap className="size-3.5 text-primary" />
              <span>Target Publikasi Hari Ini</span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="instant-status"
                  value="publish"
                  checked={value.instantStatus === "publish"}
                  onChange={() => updateField("instantStatus", "publish")}
                  className="size-3.5 text-primary focus:ring-primary"
                />
                <span>Terbitkan Langsung (Publish ke WordPress)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="radio"
                  name="instant-status"
                  value="draft"
                  checked={value.instantStatus === "draft"}
                  onChange={() => updateField("instantStatus", "draft")}
                  className="size-3.5 text-primary focus:ring-primary"
                />
                <span>Simpan sebagai Draf (Draft di WordPress)</span>
              </label>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Seluruh artikel akan diproses mulai hari ini secara bertahap oleh worker antrean.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
