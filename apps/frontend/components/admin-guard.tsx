'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Header from '@/components/header'
import { MaintenanceBlock } from '@/components/maintenance-block'
import { ServiceMessageBanner } from '@/components/service-message-banner'
import { PopupStack } from '@/components/popup-stack'
import { useSettings } from '@/components/settings-provider'
import { useSession } from '@/lib/use-session'

type AdminGuardProps = {
  children: React.ReactNode
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const { profile, isLoading } = useSession()
  const { settings, isLoading: isSettingsLoading } = useSettings()
  const router = useRouter()
  const pathname = usePathname()
  const isPendingPage = pathname === '/admin/pending'

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!profile) {
      router.replace('/auth/login')
      return
    }

    if (profile.role === 'tutor') {
      router.replace(profile.isActive === false ? '/tutor/pending' : '/tutor')
      return
    }

    if (profile.role === 'activator') {
      router.replace('/activator')
      return
    }

    if (profile.role !== 'admin') {
      router.replace(profile.isActive === false ? '/student/pending' : '/student')
      return
    }

    if (profile.isActive === false && !isPendingPage) {
      router.replace('/admin/pending')
    }
  }, [isLoading, isPendingPage, profile, router])

  if (isLoading || isSettingsLoading) {
    return (
      <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
        Caricamento...
      </div>
    )
  }

  if (!profile || profile.role !== 'admin') {
    return null
  }

  if (profile.isActive === false && !isPendingPage) {
    return null
  }

  if (profile.isActive === true && isPendingPage) {
    return null
  }

  const maintenanceActive =
    Boolean(settings?.maintenance.enabled) && !isPendingPage

  return (
    <>
      <Header />
      <ServiceMessageBanner />
      {!maintenanceActive && <PopupStack profile={profile} />}
      {maintenanceActive ? (
        <MaintenanceBlock message={settings?.maintenance.message} />
      ) : (
        children
      )}
    </>
  )
}
