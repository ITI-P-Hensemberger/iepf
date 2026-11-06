'use client'

import type { ColumnDef } from '@tanstack/react-table'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { StatsListConfig } from '@/components/admin-stats/stats-list'

import { AnalyticsTab } from '@/components/admin-stats/analytics-tab'
import { FeedbackTab } from '@/components/admin-stats/feedback-tab'
import { OverviewTab } from '@/components/admin-stats/overview-tab'
import { StatsList } from '@/components/admin-stats/stats-list'
import { BackButton } from '@/components/back-button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type SubjectTutorCount = { subjectId: string, name: string, tutorCount: number }
type SubjectRequestSummary = { subjectName: string, requestCount: number }
type LessonCountRow = { firstName: string, lastName: string, sectionName: string | null, countedLessons: number }

function numberColumn<T>(key: keyof T & string, header: string): ColumnDef<T> {
  return {
    accessorKey: key,
    header: () => <div className='text-right'>{header}</div>,
    cell: ({ row }) => <div className='text-right tabular-nums'>{String(row.original[key])}</div>
  }
}

function peopleColumns(header: string): ColumnDef<LessonCountRow>[] {
  return [
    { accessorKey: 'lastName', header, cell: ({ row }) => `${row.original.lastName} ${row.original.firstName}` },
    { accessorKey: 'sectionName', header: 'Sezione', cell: ({ row }) => row.original.sectionName ?? '-' },
    numberColumn<LessonCountRow>('countedLessons', 'Lezioni')
  ]
}

const PEOPLE_SORT = [
  { value: 'lastName', label: 'Cognome' },
  { value: 'firstName', label: 'Nome' },
  { value: 'email', label: 'Email' },
  { value: 'sectionName', label: 'Sezione' },
  { value: 'countedLessons', label: 'Lezioni' }
]

const SUBJECTS: StatsListConfig<SubjectTutorCount> = {
  key: 'subjects',
  title: 'Tutor per materia',
  endpoint: '/api/admin/stats/subjects-tutor-counts',
  searchPlaceholder: 'Nome materia',
  sortOptions: [
    { value: 'name', label: 'Nome' },
    { value: 'canonicalName', label: 'Nome canonico' },
    { value: 'tutorCount', label: 'Tutor' }
  ],
  defaultSort: { sortBy: 'name', sortDir: 'asc' },
  columns: [{ accessorKey: 'name', header: 'Materia' }, numberColumn<SubjectTutorCount>('tutorCount', 'Tutor')],
  emptyMessage: 'Nessun risultato trovato.',
  errorMessage: 'Impossibile caricare le statistiche materie.'
}

const SUBJECT_REQUESTS: StatsListConfig<SubjectRequestSummary> = {
  key: 'subjectRequests',
  title: 'Richieste di nuove materie',
  endpoint: '/api/subject-requests',
  extraParams: { mode: 'summary' },
  searchPlaceholder: 'Nome materia',
  sortOptions: [
    { value: 'subjectName', label: 'Materia' },
    { value: 'requestCount', label: 'Richieste' }
  ],
  defaultSort: { sortBy: 'requestCount', sortDir: 'desc' },
  columns: [{ accessorKey: 'subjectName', header: 'Materia' }, numberColumn<SubjectRequestSummary>('requestCount', 'Richieste')],
  emptyMessage: 'Nessuna richiesta trovata.',
  errorMessage: 'Impossibile caricare le richieste materia.'
}

const TUTORS: StatsListConfig<LessonCountRow> = {
  key: 'tutors',
  title: 'Lezioni conteggiate per tutor',
  endpoint: '/api/admin/stats/lessons-counts/tutors',
  searchPlaceholder: 'Nome o cognome',
  sortOptions: PEOPLE_SORT,
  defaultSort: { sortBy: 'lastName', sortDir: 'asc' },
  columns: peopleColumns('Tutor'),
  emptyMessage: 'Nessun risultato trovato.',
  errorMessage: 'Impossibile caricare le statistiche tutor.'
}

const STUDENTS: StatsListConfig<LessonCountRow> = {
  ...TUTORS,
  key: 'students',
  title: 'Lezioni conteggiate per studente',
  endpoint: '/api/admin/stats/lessons-counts/students',
  columns: peopleColumns('Studente'),
  errorMessage: 'Impossibile caricare le statistiche studenti.'
}

// Analytics sits right after the overview: it answers "is the site being used?".
const TABS = [
  { value: 'overview', label: 'Panoramica', content: () => <OverviewTab /> },
  { value: 'usage', label: 'Utilizzo', content: () => <AnalyticsTab /> },
  { value: 'tutors', label: 'Tutor', content: () => <StatsList config={TUTORS} /> },
  { value: 'students', label: 'Studenti', content: () => <StatsList config={STUDENTS} /> },
  { value: 'subjects', label: 'Materie', content: () => <StatsList config={SUBJECTS} /> },
  { value: 'subject-requests', label: 'Richieste materie', content: () => <StatsList config={SUBJECT_REQUESTS} /> },
  { value: 'feedback', label: 'Feedback', content: () => <FeedbackTab /> }
] as const

export default function AdminStatsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get('tab')
  const activeTab = TABS.some(tab => tab.value === requested) ? requested! : 'overview'

  const changeTab = (value: string) => {
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
          <BackButton />
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
            <TabsList className='hidden w-full md:grid md:grid-cols-7'>
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
