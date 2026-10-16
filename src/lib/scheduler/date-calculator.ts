/**
 * @file date-calculator.ts
 * @description Utilitas kalkulasi jadwal tayang artikel untuk Modul 2 (Batch Keyword Ingestion)
 * Mendukung 3 strategi:
 * 1. Random (Tanggal Acak dalam rentang waktu tertentu)
 * 2. Interval (Pola interval jam tertentu, misal: setiap 32 jam sekali)
 * 3. Instant (Semua diposting hari itu juga)
 */

export type ScheduleMode = "random" | "interval" | "instant"

export interface RandomScheduleConfig {
  startDate: string // ISO string atau datetime-local "YYYY-MM-DDTHH:mm"
  endDate: string // ISO string atau datetime-local "YYYY-MM-DDTHH:mm"
  wpTargetStatus?: "publish" | "draft"
}

export interface IntervalScheduleConfig {
  startDate: string // ISO string atau datetime-local "YYYY-MM-DDTHH:mm"
  intervalHours: number // contoh: 2, 6, 12, 24, atau 32 jam sekali
  enableJitter?: boolean // default: true (variasi ±5–10 menit mulai item kedua, lihat `intervalJitterMinutes`)
  wpTargetStatus?: "publish" | "draft"
}

/** Rentang variasi menit pola interval (label `ScheduleStrategyPicker` memakai konstanta yang sama). */
export const INTERVAL_JITTER_MIN_MINUTES = 5
export const INTERVAL_JITTER_MAX_MINUTES = 10

/**
 * Variasi menit pola interval: besaran bulat 5–10 menit dengan arah acak (maju/mundur), tidak pernah 0,
 * sehingga jam tayang tidak jatuh tepat di menit jadwal dasar (mis. :00). `random` dapat diganti di test.
 */
export function intervalJitterMinutes(random: () => number = Math.random): number {
  const span = INTERVAL_JITTER_MAX_MINUTES - INTERVAL_JITTER_MIN_MINUTES + 1
  const magnitude = INTERVAL_JITTER_MIN_MINUTES + Math.min(span - 1, Math.floor(random() * span))
  return random() < 0.5 ? -magnitude : magnitude
}

export interface InstantScheduleConfig {
  wpTargetStatus: "publish" | "draft"
}

export interface ScheduleCalculationOptions {
  mode: ScheduleMode
  itemCount: number
  randomConfig?: RandomScheduleConfig
  intervalConfig?: IntervalScheduleConfig
  instantConfig?: InstantScheduleConfig
}

export interface ScheduledSlot {
  index: number
  scheduledFor: Date
  formattedDisplay: string
  wpTargetStatus: "publish" | "future" | "draft"
}

/**
 * Format tanggal ke standar Bahasa Indonesia yang ramah pembaca
 * Contoh: "Rab, 30 Sep 2026, 14:35 WIB"
 */
export function formatIndonesianDateTime(date: Date): string {
  try {
    const formatted = new Intl.DateTimeFormat("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    }).format(date)
    return `${formatted} WIB`
  } catch {
    return date.toLocaleString("id-ID")
  }
}

/**
 * Menghitung daftar slot waktu penerbitan untuk sejumlah item kata kunci
 */
export function calculateScheduleDates(options: ScheduleCalculationOptions): ScheduledSlot[] {
  const { mode, itemCount, randomConfig, intervalConfig, instantConfig } = options

  if (itemCount <= 0) {
    return []
  }

  const now = new Date()
  const slots: ScheduledSlot[] = []

  switch (mode) {
    case "random": {
      // 1. Mode Tanggal Acak (Random Dates within Range)
      const startMs = randomConfig?.startDate
        ? new Date(randomConfig.startDate).getTime()
        : now.getTime() + 60 * 60 * 1000 // default: 1 jam dari sekarang

      const endMs = randomConfig?.endDate
        ? new Date(randomConfig.endDate).getTime()
        : startMs + 7 * 24 * 60 * 60 * 1000 // default: 7 hari dari start

      const safeEndMs = endMs > startMs ? endMs : startMs + 24 * 60 * 60 * 1000
      const totalDelta = safeEndMs - startMs

      // Bagi rentang menjadi N slot merata agar artikel tersebar seimbang
      const slotDelta = totalDelta / itemCount
      const generatedTimestamps: number[] = []

      for (let i = 0; i < itemCount; i++) {
        // Acak titik waktu di dalam masing-masing slot
        const slotStart = startMs + i * slotDelta
        const randomOffset = Math.random() * slotDelta
        // Tambahkan minute jitter (-7 s.d +7 menit)
        const jitterMs = (Math.floor(Math.random() * 15) - 7) * 60 * 1000
        let timestamp = Math.round(slotStart + randomOffset + jitterMs)

        // Batasi agar tidak keluar dari rentang batas
        timestamp = Math.max(startMs, Math.min(safeEndMs, timestamp))
        generatedTimestamps.push(timestamp)
      }

      // Urutkan secara kronologis
      generatedTimestamps.sort((a, b) => a - b)

      generatedTimestamps.forEach((ts, idx) => {
        const slotDate = new Date(ts)
        slots.push({
          index: idx,
          scheduledFor: slotDate,
          formattedDisplay: formatIndonesianDateTime(slotDate),
          wpTargetStatus: randomConfig?.wpTargetStatus || "publish",
        })
      })
      break
    }

    case "interval": {
      // 2. Mode Pola Interval (Setiap X jam sekali)
      const startMs = intervalConfig?.startDate
        ? new Date(intervalConfig.startDate).getTime()
        : now.getTime()

      const intervalHours = Math.max(1, intervalConfig?.intervalHours || 24)
      const intervalMs = intervalHours * 60 * 60 * 1000
      const enableJitter = intervalConfig?.enableJitter !== false

      for (let i = 0; i < itemCount; i++) {
        const baseTime = startMs + i * intervalMs
        let finalTime = baseTime

        if (enableJitter && i > 0) {
          // Artikel pertama tetap tepat di waktu mulai pilihan pengguna; berikutnya digeser ±5–10 menit.
          finalTime = baseTime + intervalJitterMinutes() * 60 * 1000
        }

        const slotDate = new Date(finalTime)
        slots.push({
          index: i,
          scheduledFor: slotDate,
          formattedDisplay: formatIndonesianDateTime(slotDate),
          wpTargetStatus: intervalConfig?.wpTargetStatus || "publish",
        })
      }
      break
    }

    case "instant":
    default: {
      // 3. Mode Instan (Semua diposting hari itu juga)
      const targetStatus = instantConfig?.wpTargetStatus || "publish"
      for (let i = 0; i < itemCount; i++) {
        // Beri jeda kecil 1 menit antar posting jika di WordPress agar ID berurutan rapi
        const slotDate = new Date(now.getTime() + i * 60 * 1000)
        slots.push({
          index: i,
          scheduledFor: slotDate,
          formattedDisplay: `Hari Ini (${formatIndonesianDateTime(slotDate)})`,
          wpTargetStatus: targetStatus,
        })
      }
      break
    }
  }

  return slots
}
