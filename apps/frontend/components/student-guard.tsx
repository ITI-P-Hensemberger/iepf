'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Header from '@/components/header'
import { useSession } from '@/lib/use-session'

type StudentGuardProps = {
  children: React.ReactNode
}

export default function StudentGuard({ children }: StudentGuardProps) {
  const { profile, isLoading } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const isPendingPage = pathname === '/student/pending'

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

    if (profile.role === 'activator') {
      router.replace('/activator')
      return
    }

    if (profile.isActive === false && !isPendingPage) {
      router.replace('/student/pending')
      return
    }

    if (profile.isActive === true && isPendingPage) {
      router.replace('/student')
    }
  }, [isLoading, isPendingPage, profile, router])

  if (isLoading) {
    return (
      <div className='container mx-auto px-4 py-10 text-sm text-muted-foreground'>
        Caricamento...
      </div>
    )
  }

  if (!profile) {
    return null
  }

  if (profile.role === 'admin' || profile.role === 'tutor') {
    return null
  }

  if (profile.isActive === false && !isPendingPage) {
    return null
  }

  if (profile.isActive === true && isPendingPage) {
    return null
  }

  return (
    <>
      <Header />
      {children}
    </>
  )
}
