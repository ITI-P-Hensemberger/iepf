'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Header from '@/components/header'
import { MaintenanceBlock } from '@/components/maintenance-block'
import { ServiceMessageBanner } from '@/components/service-message-banner'
import { PopupStack } from '@/components/popup-stack'
import { useSettings } from '@/components/settings-provider'
import { useSession } from '@/lib/use-session'
import { useTutorOnboarding } from '@/lib/use-tutor-onboarding'

type TutorGuardProps = {
  children: React.ReactNode
}

export default function TutorGuard({ children }: TutorGuardProps) {
  const { profile, isLoading } = useSession()
  const { settings, isLoading: isSettingsLoading } = useSettings()
  const router = useRouter()
  const pathname = usePathname()
  const isPendingPage = pathname === '/tutor/pending'
  const isOnboardingPage = pathname === '/tutor/onboarding'

  const { isFirstTime, isLoading: isOnboardingLoading } = useTutorOnboarding(
    profile?.role === 'tutor' && profile?.isActive === true
      ? profile?.id
      : undefined
  )

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

    if (profile.role === 'activator') {
      router.replace('/activator')
      return
    }

    if (profile.role !== 'tutor') {
      router.replace(
        profile.isActive === false ? '/student/pending' : '/student'
      )
      return
    }

    if (profile.isActive === false && !isPendingPage) {
      router.replace('/tutor/pending')
      return
    }

    if (profile.isActive === true && isPendingPage) {
      router.replace('/tutor')
      return
    }

    // First-time tutor redirect logic
    if (profile.isActive === true && !isOnboardingLoading) {
      if (isFirstTime && !isOnboardingPage) {
        router.replace('/tutor/onboarding')
        return
      }
      if (!isFirstTime && isOnboardingPage) {
        router.replace('/tutor')
        return
      }
    }
  }, [
    isLoading,
    isOnboardingLoading,
    isFirstTime,
    isPendingPage,
    isOnboardingPage,
    profile,
    router
  ])

  if (isLoading || isSettingsLoading) {
    return (
      <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
        Caricamento...
      </div>
    )
  }

  if (!profile || profile.role !== 'tutor') {
    return null
  }

  if (profile.isActive === false && !isPendingPage) {
    return null
  }

  if (profile.isActive === true && isPendingPage) {
    return null
  }

  // Wait for onboarding check before rendering non-onboarding pages
  if (profile.isActive === true && !isOnboardingPage && isOnboardingLoading) {
    return (
      <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
        Caricamento...
      </div>
    )
  }

  // Block rendering if redirect is needed
  if (profile.isActive === true && !isOnboardingLoading) {
    if (isFirstTime && !isOnboardingPage) {
      return null
    }
    if (!isFirstTime && isOnboardingPage) {
      return null
    }
  }

  const maintenanceActive =
    Boolean(settings?.maintenance.enabled) && !isPendingPage

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
