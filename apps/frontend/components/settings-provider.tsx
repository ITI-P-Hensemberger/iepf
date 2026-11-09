'use client'

import * as React from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-fetch'
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

// Read once and again when someone signs in or out; a failure leaves the app without the banner.
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const { data: settings = null, isPending: isLoading } = useQuery({
    queryKey: ['settings', 'me'],
    queryFn: async () => normalizeSettings(await apiFetch('/api/settings/me', 'Impossibile caricare le impostazioni.')),
    retry: false,
    meta: { inline: true }
  })

  React.useEffect(() => {
    const handleAuthChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'me'] })
    }
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged)
    }
  }, [queryClient])

  const value = React.useMemo(() => ({ settings, isLoading }), [settings, isLoading])

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
