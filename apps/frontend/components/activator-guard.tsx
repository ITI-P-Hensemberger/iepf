'use client'

import { PageSkeleton } from '@/components/loading'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useSession } from '@/lib/use-session'
import { useSettings } from '@/components/settings-provider'
import { MaintenanceBlock } from '@/components/maintenance-block'
import { ServiceMessageBanner } from '@/components/service-message-banner'

type ActivatorGuardProps = {
  children: React.ReactNode
}

export default function ActivatorGuard({ children }: ActivatorGuardProps) {
  const { profile, isLoading } = useSession()
  const { settings, isLoading: isSettingsLoading } = useSettings()
  const router = useRouter()
  const pathname = usePathname()
  const isActivatorHome = pathname === '/activator'

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!profile) {
      router.replace('/auth/login')
      return
    }

    if (profile.role === 'admin') {
      router.replace(profile.isActive === false ? '/admin/pending' : '/admin')
      return
    }

    if (profile.role === 'tutor') {
      router.replace(profile.isActive === false ? '/tutor/pending' : '/tutor')
      return
    }

    if (profile.role !== 'activator') {
      router.replace(
        profile.isActive === false ? '/student/pending' : '/student'
      )
      return
    }

    if (!isActivatorHome) {
      router.replace('/activator')
    }
  }, [isActivatorHome, isLoading, profile, router])

  if (isLoading || isSettingsLoading) {
    return (
      <PageSkeleton />
    )
  }

  if (!profile || profile.role !== 'activator') {
    return null
  }

  if (!isActivatorHome) {
    return null
  }

  const maintenanceActive = Boolean(settings?.maintenance.enabled)

  // No Header here (the page has its own logout), but the service banner reaches every role.
  return (
    <>
      <ServiceMessageBanner />
      {maintenanceActive ? (
        <MaintenanceBlock message={settings?.maintenance.message} />
      ) : (
        children
      )}
    </>
  )
}
