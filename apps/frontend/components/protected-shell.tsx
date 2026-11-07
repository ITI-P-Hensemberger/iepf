'use client'

import { PageSkeleton } from '@/components/loading'
import * as React from 'react'
import { usePathname } from 'next/navigation'

import Header from '@/components/header'
import { MaintenanceBlock } from '@/components/maintenance-block'
import { ServiceMessageBanner } from '@/components/service-message-banner'
import { PopupStack } from '@/components/popup-stack'
import { useSettings } from '@/components/settings-provider'
import { useSession } from '@/lib/use-session'

type ProtectedShellProps = {
  children: React.ReactNode
}

export default function ProtectedShell({ children }: ProtectedShellProps) {
  const { isLoading, profile } = useSession()
  const pathname = usePathname()
  const { settings, isLoading: isSettingsLoading } = useSettings()

  if (isLoading || isSettingsLoading) {
    return (
      <PageSkeleton />
    )
  }

  const maintenanceActive =
    Boolean(settings?.maintenance.enabled) && pathname !== '/profile'

  return (
    <>
      {!maintenanceActive && <Header />}
      {!maintenanceActive && <ServiceMessageBanner />}
      {!maintenanceActive && <PopupStack profile={profile} />}
      {maintenanceActive ? (
        <MaintenanceBlock message={settings?.maintenance.message} />
      ) : (
        children
      )}
    </>
  )
}
