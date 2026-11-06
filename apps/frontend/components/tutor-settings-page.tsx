'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, CalendarClock } from 'lucide-react'

import { SectionLayout } from '@/components/section-layout'
import { TutorAvailabilitySettings } from '@/components/tutor-availability-settings'
import { TutorSubjectsSettings } from '@/components/tutor-subjects-settings'

const SECTIONS = [
  { value: 'availability', label: 'Disponibilità', icon: CalendarClock },
  { value: 'subjects', label: 'Materie', icon: BookOpen }
] as const

// The tutor's teaching settings, one section open at a time: the weekly availability and the
// subjects. Profile and notifications stay on the profile page.
export default function TutorSettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = searchParams.get('tab') === 'subjects' ? 'subjects' : 'availability'

  const change = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'availability') params.delete('tab')
    else params.set('tab', value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <SectionLayout title='Impostazioni' backHref='/tutor' sections={SECTIONS} value={active} onValueChange={change}>
      {active === 'subjects' ? <TutorSubjectsSettings /> : <TutorAvailabilitySettings />}
    </SectionLayout>
  )
}
