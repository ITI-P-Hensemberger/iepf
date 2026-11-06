'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { StatsColumn } from '@/components/admin-stats/data-table'
import type { StatsListConfig } from '@/components/admin-stats/stats-list'

import { AnalyticsTab } from '@/components/admin-stats/analytics-tab'
import { ExportsTab } from '@/components/admin-stats/exports-tab'
import { FeedbackTab } from '@/components/admin-stats/feedback-tab'
import { NotificationsTab } from '@/components/admin-stats/notifications-tab'
import { OverviewTab } from '@/components/admin-stats/overview-tab'
import { StatsList } from '@/components/admin-stats/stats-list'
import { BackButton } from '@/components/back-button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type SubjectTutorCount = { subjectId: string, name: string, tutorCount: number }
type SubjectRequestSummary = { subjectName: string, canonicalName: string, requestCount: number }
type Person = { email: string, firstName: string, lastName: string, sectionName: string | null, countedLessons: number }
type TutorRow = Person & {
  tutorId: string
  lessonsDone: number
  lessonsUpcoming: number
  lessonsCanceled: number
}
type StudentRow = Person & {
  studentId: string
  lessonsPresentCounted: number
  lessonsPresentNotCounted: number
  lessonsAbsentCounted: number
  lessonsAbsentNotCounted: number
  lessonsWithoutPresenceCounted: number
  lessonsWithoutPresenceNotCounted: number
}

// Some counts arrive as strings (Postgres bigint): add them as numbers.
const n = (value: number | string | null | undefined) => Number(value ?? 0)

function nameColumn<T extends Person>(header: string): StatsColumn<T> {
  return {
    key: 'name',
    header,
    sortKey: 'lastName',
    cell: row => (
      <div className='min-w-0'>
        <div className='font-medium'>{row.lastName} {row.firstName}</div>
        <div className='truncate text-xs text-muted-foreground'>{row.email}</div>
      </div>
    )
  }
}

function numberColumn<T>(key: string, header: string, value: (row: T) => number, sortKey?: string): StatsColumn<T> {
  return { key, header, sortKey, numeric: true, cell: value }
}

const sectionColumn = <T extends Person>(): StatsColumn<T> => ({ key: 'section', header: 'Sezione', sortKey: 'sectionName', cell: row => row.sectionName ?? '–' })

const TUTORS: StatsListConfig<TutorRow> = {
  key: 'tutors',
  title: 'Tutor',
  description: 'Lezioni per tutor. "Conteggiate" valgono per le ore del tutor; "Scadute" sono finite senza prenotazioni.',
  endpoint: '/api/admin/stats/lessons-counts/tutors',
  searchPlaceholder: 'Nome, cognome, email o sezione',
  defaultSort: { sortBy: 'lastName', sortDir: 'asc' },
  descendingFirst: ['countedLessons'],
  columns: [
    nameColumn('Tutor'),
    sectionColumn(),
    numberColumn('counted', 'Conteggiate', row => n(row.countedLessons), 'countedLessons'),
    numberColumn('done', 'Svolte', row => n(row.lessonsDone)),
    numberColumn('upcoming', 'In programma', row => n(row.lessonsUpcoming)),
    numberColumn('canceled', 'Annullate', row => n(row.lessonsCanceled))
  ],
  rowKey: row => row.tutorId,
  emptyMessage: 'Nessun tutor.',
  errorMessage: 'Impossibile caricare le statistiche tutor.'
}

const STUDENTS: StatsListConfig<StudentRow> = {
  key: 'students',
  title: 'Studenti',
  description: 'Lezioni prenotate per studente e presenze registrate dai tutor.',
  endpoint: '/api/admin/stats/lessons-counts/students',
  searchPlaceholder: 'Nome, cognome, email o sezione',
  defaultSort: { sortBy: 'lastName', sortDir: 'asc' },
  descendingFirst: ['countedLessons'],
  columns: [
    nameColumn('Studente'),
    sectionColumn(),
    numberColumn('counted', 'Conteggiate', row => n(row.countedLessons), 'countedLessons'),
    numberColumn('present', 'Presenze', row => n(row.lessonsPresentCounted) + n(row.lessonsPresentNotCounted)),
    numberColumn('absent', 'Assenze', row => n(row.lessonsAbsentCounted) + n(row.lessonsAbsentNotCounted)),
    numberColumn('unrecorded', 'Da registrare', row => n(row.lessonsWithoutPresenceCounted) + n(row.lessonsWithoutPresenceNotCounted))
  ],
  rowKey: row => row.studentId,
  emptyMessage: 'Nessuno studente.',
  errorMessage: 'Impossibile caricare le statistiche studenti.'
}

const SUBJECTS: StatsListConfig<SubjectTutorCount> = {
  key: 'subjects',
  title: 'Materie',
  description: 'Quanti tutor insegnano ogni materia. Le materie senza tutor non sono prenotabili.',
  endpoint: '/api/admin/stats/subjects-tutor-counts',
  searchPlaceholder: 'Nome della materia',
  defaultSort: { sortBy: 'name', sortDir: 'asc' },
  descendingFirst: ['tutorCount'],
  columns: [
    { key: 'name', header: 'Materia', sortKey: 'name', cell: row => row.name },
    {
      key: 'tutors',
      header: 'Tutor',
      sortKey: 'tutorCount',
      numeric: true,
      cell: row => n(row.tutorCount) > 0 ? n(row.tutorCount) : <Badge variant='outline'>Nessun tutor</Badge>
    }
  ],
  rowKey: row => row.subjectId,
  emptyMessage: 'Nessuna materia.',
  errorMessage: 'Impossibile caricare le statistiche materie.'
}

const SUBJECT_REQUESTS: StatsListConfig<SubjectRequestSummary> = {
  key: 'subjectRequests',
  title: 'Richieste di nuove materie',
  description: 'Materie che gli studenti hanno chiesto e che nessun tutor insegna ancora.',
  endpoint: '/api/subject-requests',
  extraParams: { mode: 'summary' },
  searchPlaceholder: 'Nome della materia',
  defaultSort: { sortBy: 'requestCount', sortDir: 'desc' },
  descendingFirst: ['requestCount'],
  columns: [
    { key: 'subject', header: 'Materia', sortKey: 'subjectName', cell: row => row.subjectName },
    numberColumn('requests', 'Studenti che la chiedono', row => n(row.requestCount), 'requestCount')
  ],
  rowKey: row => row.canonicalName ?? row.subjectName,
  emptyMessage: 'Nessuna richiesta.',
  errorMessage: 'Impossibile caricare le richieste materia.'
}

const TABS = [
  { value: 'overview', label: 'Panoramica', content: () => <OverviewTab /> },
  { value: 'usage', label: 'Utilizzo', content: () => <AnalyticsTab /> },
  { value: 'notifications', label: 'Notifiche', content: () => <NotificationsTab /> },
  { value: 'tutors', label: 'Tutor', content: () => <StatsList config={TUTORS} /> },
  { value: 'students', label: 'Studenti', content: () => <StatsList config={STUDENTS} /> },
  { value: 'subjects', label: 'Materie', content: () => <StatsList config={SUBJECTS} /> },
  { value: 'subject-requests', label: 'Richieste', content: () => <StatsList config={SUBJECT_REQUESTS} /> },
  { value: 'feedback', label: 'Feedback', content: () => <FeedbackTab /> },
  { value: 'exports', label: 'Esportazioni', content: () => <ExportsTab /> }
] as const

export default function AdminStatsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get('tab')
  const activeTab = TABS.some(tab => tab.value === requested) ? requested! : 'overview'

  const changeTab = (value: string) => {
    // Each tab keeps its own filters in the URL; switching tab only changes `tab`.
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'overview') params.delete('tab')
    else params.set('tab', value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto flex flex-col items-center px-4 py-10'>
        <div className='w-full max-w-6xl space-y-6'>
          <BackButton href='/admin' />
          <h1 className='text-2xl'>Statistiche</h1>

          <Tabs value={activeTab} onValueChange={changeTab}>
            <div className='md:hidden'>
              <Select value={activeTab} onValueChange={changeTab}>
                <SelectTrigger className='w-full' aria-label='Sezione'>
                  <SelectValue placeholder='Seleziona sezione' />
                </SelectTrigger>
                <SelectContent>
                  {TABS.map(tab => <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <TabsList className='hidden w-full md:grid md:grid-cols-9'>
              {TABS.map(tab => <TabsTrigger key={tab.value} value={tab.value} className='w-full'>{tab.label}</TabsTrigger>)}
            </TabsList>

            {/* Only the open tab is mounted, so only its data is fetched. */}
            {TABS.map(tab => (
              <TabsContent key={tab.value} value={tab.value} className='mt-6'>
                {activeTab === tab.value && tab.content()}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </main>
  )
}
