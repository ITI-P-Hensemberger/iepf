'use client'

import { TutorOnboardingForm } from '@/components/tutor-onboarding-form'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/lib/use-session'

export default function TutorOnboardingPage() {
  const { profile, isLoading } = useSession()

  if (isLoading) {
    return (
      <main className='min-h-screen'>
        <div className='container mx-auto px-4 py-10 flex justify-center'>
          <Card className='w-full max-w-3xl'>
            <CardHeader className='space-y-2'>
              <Skeleton className='h-8 w-3/4' />
              <Skeleton className='h-4 w-full' />
            </CardHeader>
            <CardContent className='space-y-8'>
              <div className='space-y-4'>
                <Skeleton className='h-6 w-1/3' />
                <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className='h-12 w-full' />
                  ))}
                </div>
              </div>
              <div className='space-y-4'>
                <Skeleton className='h-6 w-1/3' />
                <div className='flex gap-2'>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className='h-10 flex-1' />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  if (!profile?.id) {
    return null
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='max-w-6xl mx-auto'>
          <TutorOnboardingForm tutorId={profile.id} />
        </div>
      </div>
    </main>
  )
}
