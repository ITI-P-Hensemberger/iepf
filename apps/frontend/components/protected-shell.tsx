'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

import Header from '@/components/header'
import { MaintenanceBlock } from '@/components/maintenance-block'
import { ServiceMessageBanner } from '@/components/service-message-banner'
import { AnnouncementPopup } from '@/components/announcement-popup'
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
      <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
        Caricamento...
      </div>
    )
  }

  const maintenanceActive =
    Boolean(settings?.maintenance.enabled) && pathname !== '/profile'

  return (
    <>
      <Header />
      <ServiceMessageBanner />
      {!maintenanceActive && profile?.id && profile.isActive !== false && (
        <AnnouncementPopup userId={profile.id} />
      )}
      {maintenanceActive ? (
        <MaintenanceBlock message={settings?.maintenance.message} />
      ) : (
        children
      )}
    </>
  )
}
