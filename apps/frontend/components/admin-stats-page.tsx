'use client'

import { Fragment } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bell, BookOpen, ChartLine, Download, GraduationCap, LayoutDashboard, MessageSquarePlus, Star, Users } from 'lucide-react'

import type { StatsColumn } from '@/components/admin-stats/data-table'
import type { StatsListConfig } from '@/components/admin-stats/stats-list'

import { AnalyticsTab } from '@/components/admin-stats/analytics-tab'
import { ExportsTab } from '@/components/admin-stats/exports-tab'
import { FeedbackTab } from '@/components/admin-stats/feedback-tab'
import { NotificationsTab } from '@/components/admin-stats/notifications-tab'
import { OverviewTab } from '@/components/admin-stats/overview-tab'
import { StatsList } from '@/components/admin-stats/stats-list'
import { Badge } from '@/components/ui/badge'
import { SectionLayout } from '@/components/section-layout'

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
  description: 'Lezioni prenotate per tutor. "Conteggiate" valgono per le ore del tutor; gli slot senza prenotazioni non sono contati.',
  endpoint: '/api/admin/stats/lessons-counts/tutors',
  searchPlaceholder: 'Nome, cognome, email o sezione',
  defaultSort: { sortBy: 'lastName', sortDir: 'asc' },
  descendingFirst: ['countedLessons'],
  columns: [
    nameColumn('Tutor'),
    sectionColumn(),
    numberColumn('counted', 'Conteggiate', row => n(row.countedLessons), 'countedLessons'),
    numberColumn('done', 'Svolte', row => n(row.lessonsDone)),
    numberColumn('upcoming', 'Confermate', row => n(row.lessonsUpcoming)),
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
  { value: 'overview', label: 'Panoramica', icon: LayoutDashboard, content: () => <OverviewTab /> },
  { value: 'usage', label: 'Utilizzo', icon: ChartLine, content: () => <AnalyticsTab /> },
  { value: 'notifications', label: 'Notifiche', icon: Bell, content: () => <NotificationsTab /> },
  { value: 'tutors', label: 'Tutor', icon: GraduationCap, separatorBefore: true, content: () => <StatsList config={TUTORS} /> },
  { value: 'students', label: 'Studenti', icon: Users, content: () => <StatsList config={STUDENTS} /> },
  { value: 'subjects', label: 'Materie', icon: BookOpen, content: () => <StatsList config={SUBJECTS} /> },
  { value: 'subject-requests', label: 'Richieste', icon: MessageSquarePlus, content: () => <StatsList config={SUBJECT_REQUESTS} /> },
  { value: 'feedback', label: 'Feedback', icon: Star, content: () => <FeedbackTab /> },
  { value: 'exports', label: 'Esportazioni', icon: Download, separatorBefore: true, content: () => <ExportsTab /> }
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

  const active = TABS.find(tab => tab.value === activeTab) ?? TABS[0]
  // Only the open section is mounted, so only its data is fetched.
  return (
    <SectionLayout title='Statistiche' backHref='/admin' sections={TABS} value={activeTab} onValueChange={changeTab}>
      {/* A new section starts fresh: lists share one component, and its rows must not carry over. */}
      <Fragment key={active.value}>{active.content()}</Fragment>
    </SectionLayout>
  )
}
