'use client'

import { AuthLayout } from '@/components/auth-layout'
import { PageSkeleton } from '@/components/loading'
import { TutorOnboardingForm } from '@/components/tutor-onboarding-form'
import { useSession } from '@/lib/use-session'

// A tutor's first visit: subjects and availability before anything else.
export default function TutorOnboardingPage() {
  const { profile, isLoading } = useSession()

  if (isLoading) return <PageSkeleton />
  if (!profile?.id) return null

  return (
    <AuthLayout
      title='Configura il tuo profilo tutor'
      description='Scegli le materie che puoi insegnare e i giorni in cui sei disponibile.'
      backHref={null}
      wide
    >
      <TutorOnboardingForm tutorId={profile.id} />
    </AuthLayout>
  )
}
