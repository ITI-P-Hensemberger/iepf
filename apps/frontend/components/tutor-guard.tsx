'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Header from '@/components/header'
import { useSession } from '@/lib/use-session'

type TutorGuardProps = {
  children: React.ReactNode
}

export default function TutorGuard({ children }: TutorGuardProps) {
  const { profile, isLoading } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const isPendingPage = pathname === '/tutor/pending'

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

    if (profile.role !== 'tutor') {
      router.replace(profile.isActive === false ? '/student/pending' : '/student')
      return
    }

    if (profile.isActive === false && !isPendingPage) {
      router.replace('/tutor/pending')
    }

    if (profile.isActive === true && isPendingPage) {
      router.replace('/tutor')
    }
  }, [isLoading, isPendingPage, profile, router])

  if (isLoading) {
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

  return (
    <>
      <Header />
      {children}
    </>
  )
}
