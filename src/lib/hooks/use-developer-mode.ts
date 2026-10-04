"use client"

import * as React from "react"

const STORAGE_KEY = "panitera_developer_mode"
const CHANGE_EVENT = "panitera_developer_mode_changed"

export function useDeveloperMode() {
  const [developerMode, setDeveloperModeState] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored !== null) return stored === "true"
      } catch {
        // Abaikan galat localStorage
      }
    }
    return false
  })
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true

    fetch("/api/settings/user")
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return
        if (data.ok && typeof data.developerMode === "boolean") {
          setDeveloperModeState(data.developerMode)
          try {
            localStorage.setItem(STORAGE_KEY, String(data.developerMode))
          } catch {
            // Abaikan galat localStorage
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored !== null) {
          setDeveloperModeState(stored === "true")
        }
      } catch {
        // Abaikan galat localStorage
      }
    }

    window.addEventListener(CHANGE_EVENT, handleStorageChange)
    window.addEventListener("storage", handleStorageChange)

    return () => {
      isMounted = false
      window.removeEventListener(CHANGE_EVENT, handleStorageChange)
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [])

  const setDeveloperMode = React.useCallback((enabled: boolean) => {
    setDeveloperModeState(enabled)
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, String(enabled))
      } catch {
        // Abaikan galat localStorage
      }
      window.dispatchEvent(new Event(CHANGE_EVENT))
    }
  }, [])

  return { developerMode, setDeveloperMode, isLoading }
}
