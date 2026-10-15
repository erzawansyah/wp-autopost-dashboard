"use client"

import * as React from "react"

/**
 * Store tema terang/gelap (kelas `.dark` di `<html>` + `localStorage["theme"]`).
 * Tema awal dipasang skrip inline di `src/app/layout.tsx` sebelum hydration (tanpa kedip);
 * hook ini hanya membaca/mengubahnya dan menyinkronkan antar-tab lewat event `storage`.
 */

export type ThemeName = "light" | "dark"

const STORAGE_KEY = "theme"
const listeners = new Set<() => void>()

function applyTheme(theme: ThemeName): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    if (event.newValue === "dark" || event.newValue === "light") applyTheme(event.newValue)
    callback()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(callback)
    window.removeEventListener("storage", onStorage)
  }
}

function getSnapshot(): ThemeName {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function getServerSnapshot(): ThemeName {
  return "light"
}

function setTheme(theme: ThemeName): void {
  applyTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // localStorage diblokir (mode privat/kebijakan browser): tema tetap berlaku untuk sesi ini.
  }
  notify()
}

export function useTheme(): { theme: ThemeName; setTheme: (theme: ThemeName) => void } {
  const theme = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { theme, setTheme }
}
