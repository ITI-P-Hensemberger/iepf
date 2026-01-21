'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useSession } from '@/lib/use-session'

type ActivatorGuardProps = {
  children: React.ReactNode
}

export default function ActivatorGuard({ children }: ActivatorGuardProps) {
  const { profile, isLoading } = useSession()
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

  if (isLoading) {
    return (
      <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
        Caricamento...
      </div>
    )
  }

  if (!profile || profile.role !== 'activator') {
    return null
  }

  if (!isActivatorHome) {
    return null
  }

  return <>{children}</>
}
