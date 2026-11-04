'use client'

import * as React from 'react'

import { AUTH_CHANGED_EVENT } from '@/lib/auth-events'

type MessageLevel = 'info' | 'warning' | 'error' | 'success'

export type MaintenanceSettings = {
  enabled: boolean
  message: string | null
}

export type ServiceMessage = {
  enabled: boolean
  level: MessageLevel
  title: string
  body: string
}

export type SettingsPayload = {
  maintenance: MaintenanceSettings
  serviceMessage: ServiceMessage | null
}

type SettingsContextValue = {
  settings: SettingsPayload | null
  isLoading: boolean
  refresh: () => Promise<void>
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null)

function normalizeSettings(payload: unknown): SettingsPayload {
  const fallback: SettingsPayload = {
    maintenance: {
      enabled: false,
      message: null
    },
    serviceMessage: null
  }

  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const data = payload as Partial<SettingsPayload>
  return {
    maintenance: data.maintenance ?? fallback.maintenance,
    serviceMessage: data.serviceMessage ?? null
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<SettingsPayload | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/settings/me')
      if (!response.ok) {
        throw new Error('Failed to fetch settings.')
      }
      const payload = await response.json()
      setSettings(normalizeSettings(payload))
    } catch {
      setSettings(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    const handleAuthChanged = () => {
      void refresh()
    }
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged)
    }
  }, [refresh])

  const value = React.useMemo(
    () => ({ settings, isLoading, refresh }),
    [settings, isLoading, refresh]
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = React.useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}
