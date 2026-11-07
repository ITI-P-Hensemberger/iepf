'use client'

// The lessons pages for tutors and admins: the new agenda first, the filterable list as before.
import { useSearchParams } from 'next/navigation'

import AdminDayPage from '@/components/admin-day-page'
import AdminLessonsPage from '@/components/admin-lessons-page'
import { PageHeader } from '@/components/page-header'
import { LessonViewSwitch } from '@/components/lesson-view-switch'
import TutorLessonsPage from '@/components/tutor-lessons-page'
import TutorWeekPage from '@/components/tutor-week-page'

function AgendaLayout({ title, home, switcher, children }: { title: string, home: string, switcher: React.ReactNode, children: React.ReactNode }) {
  return (
    <main className='flex-1'>
      <div className='container mx-auto flex flex-col items-center px-4 py-10'>
        <div className='w-full max-w-6xl'>
          <PageHeader title={title} backHref={home} actions={switcher} className='mb-6' />
          {children}
        </div>
      </div>
    </main>
  )
}

export function TutorLessonViews() {
  const view = useSearchParams().get('view') === 'list' ? 'list' : 'week'
  const switcher = <LessonViewSwitch current={view} views={[{ key: 'week', label: 'Settimana' }, { key: 'list', label: 'Elenco' }]} />
  if (view === 'list') return <TutorLessonsPage viewSwitch={switcher} />
  return (
    <AgendaLayout title='Le mie lezioni' home='/tutor' switcher={switcher}>
      <TutorWeekPage />
    </AgendaLayout>
  )
}

export function AdminLessonViews() {
  const view = useSearchParams().get('view') === 'list' ? 'list' : 'day'
  const switcher = <LessonViewSwitch current={view} views={[{ key: 'day', label: 'Giornata' }, { key: 'list', label: 'Elenco e creazione' }]} />
  if (view === 'list') return <AdminLessonsPage viewSwitch={switcher} />
  return (
    <AgendaLayout title='Gestione lezioni' home='/admin' switcher={switcher}>
      <AdminDayPage />
    </AgendaLayout>
  )
}
