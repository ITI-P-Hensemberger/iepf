'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Header from '@/components/header'
import { useSession } from '@/lib/use-session'

type AdminGuardProps = {
  children: React.ReactNode
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const { profile, isLoading } = useSession()
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

    if (profile.role !== 'admin') {
      router.replace(profile.isActive === false ? '/student/pending' : '/student')
      return
    }

    if (profile.isActive === false && !isPendingPage) {
      router.replace('/admin/pending')
    }
  }, [isLoading, isPendingPage, profile, router])

  if (isLoading) {
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

  return (
    <>
      <Header />
      {children}
    </>
  )
}
