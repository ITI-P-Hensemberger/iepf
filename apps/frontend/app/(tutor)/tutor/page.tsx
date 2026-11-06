'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  ExternalLink
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { extractPayloadArray } from '@/lib/backend-response'
import { lessonSubject } from '@/lib/lesson-subject'
import { formatItalianDate } from '@/lib/format-date'
import { useSession } from '@/lib/use-session'
import { PushInviteCard, TUTOR_ONBOARDED_FLAG as ONBOARDED_FLAG } from '@/components/push-prompt'
import { toast } from 'sonner'

type Lesson = {
  id: string
  tutorId: string
  subjectId: string | null
  startAt: string
  lessonCapacity: number
  availableSeats: number
  status: string
}

type Subject = {
  id: string
  name: string
}

const lessonsLimit = 15

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

function endOfTodayIso() {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  return now.toISOString()
}

function startOfTomorrowIso() {
  const now = new Date()
  now.setHours(24, 0, 0, 0)
  return now.toISOString()
}

function normalizeLessons(payload: unknown): Lesson[] {
  if (!payload || typeof payload !== 'object') return []
  const data = payload as Record<string, unknown>
  if (Array.isArray(data.data)) return data.data as Lesson[]
  if (Array.isArray(data.items)) return data.items as Lesson[]
  if (Array.isArray(data.results)) return data.results as Lesson[]
  if (Array.isArray(data.rows)) return data.rows as Lesson[]
  return []
}

function normalizeTotal(payload: unknown, fallback: number) {
  if (!payload || typeof payload !== 'object') return fallback
  const data = payload as Record<string, unknown>
  if (typeof data.total === 'number') return data.total
  if (data.data && typeof data.data === 'object') {
    const nested = data.data as Record<string, unknown>
    if (typeof nested.total === 'number') return nested.total
  }
  return fallback
}

function statusVariant(
  status?: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!status) {
    return 'secondary'
  }
  const normalized = status.toLowerCase()
  if (normalized === 'canceled' || normalized === 'cancelled') {
    return 'destructive'
  }
  if (normalized === 'confirmed') {
    return 'default'
  }
  return 'secondary'
}

function formatStatusLabel(status?: string | null) {
  if (!status) {
    return '-'
  }
  const normalized = status.toLowerCase()
  const mapping: Record<string, string> = {
    confirmed: 'Confermata',
    canceled: 'Annullata',
    cancelled: 'Annullata',
    scheduled: 'Programmata'
  }
  return mapping[normalized] ?? 'Programmata'
}

function lessonSeatsLabel(lesson: Lesson) {
  const capacity = Number(lesson.lessonCapacity ?? 0)
  const available = Number(lesson.availableSeats ?? 0)
  if (!Number.isFinite(capacity) || !Number.isFinite(available)) {
    return '-'
  }
  const occupied = Math.max(0, capacity - available)
  return `${occupied}/${capacity}`
}

export default function TutorPage() {
  const { profile, isLoading: isProfileLoading } = useSession()
  // Set by the onboarding form right before it sends the tutor here.
  const [justOnboarded] = React.useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const flag = window.sessionStorage.getItem(ONBOARDED_FLAG) === '1'
      window.sessionStorage.removeItem(ONBOARDED_FLAG)
      return flag
    } catch {
      return false
    }
  })
  const tutorId = profile?.id ?? ''
  const [lessons, setLessons] = React.useState<Lesson[]>([])
  const [isLessonsLoading, setIsLessonsLoading] = React.useState(true)
  const [upcomingLessons, setUpcomingLessons] = React.useState<Lesson[]>([])
  const [isUpcomingLoading, setIsUpcomingLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [subjects, setSubjects] = React.useState<Subject[]>([])

  const subjectMap = React.useMemo(() => {
    const map = new Map<string, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  const totalPages = Math.max(1, Math.ceil(total / lessonsLimit))

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  React.useEffect(() => {
    let isMounted = true

    async function loadSubjects() {
      try {
        const response = await fetch('/api/subjects')
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        if (isMounted) {
          setSubjects(extractPayloadArray<Subject>(payload))
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile caricare le materie.'
        )
      }
    }

    void loadSubjects()

    return () => {
      isMounted = false
    }
  }, [])

  React.useEffect(() => {
    if (!tutorId) return
    let isMounted = true
    const timeout = setTimeout(() => {
      void (async () => {
        setIsLessonsLoading(true)
        try {
          const params = new URLSearchParams()
          params.set('from', startOfTodayIso())
          params.set('to', endOfTodayIso())
          params.set('status', 'confirmed')
          params.set('tutorId', tutorId)
          params.set('sortBy', 'startAt')
          params.set('sortDir', 'asc')
          params.set('limit', String(lessonsLimit))
          params.set('offset', String((page - 1) * lessonsLimit))
          if (searchQuery.trim()) {
            params.set('q', searchQuery.trim())
          }
          const response = await fetch(`/api/lessons?${params.toString()}`)
          if (!response.ok) {
            throw new Error('Impossibile caricare le lezioni odierne.')
          }
          const payload = await response.json()
          if (isMounted) {
            const nextLessons = normalizeLessons(payload)
            setLessons(nextLessons)
            setTotal(normalizeTotal(payload, nextLessons.length))
          }
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare le lezioni odierne.'
          )
          if (isMounted) {
            setLessons([])
            setTotal(0)
          }
        } finally {
          if (isMounted) {
            setIsLessonsLoading(false)
          }
        }
      })()
    }, 100)

    return () => {
      isMounted = false
      clearTimeout(timeout)
    }
  }, [page, searchQuery, tutorId])

  const loadUpcomingLessons = React.useCallback(async () => {
    if (!tutorId) {
      if (!isProfileLoading) {
        setUpcomingLessons([])
        setIsUpcomingLoading(false)
      }
      return
    }
    setIsUpcomingLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('from', startOfTomorrowIso())
      params.set('status', 'confirmed')
      params.set('tutorId', tutorId)
      params.set('sortBy', 'startAt')
      params.set('sortDir', 'asc')
      params.set('limit', '50')
      const response = await fetch(`/api/lessons?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le lezioni programmate.')
      }
      const payload = await response.json()
      setUpcomingLessons(normalizeLessons(payload))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile caricare le lezioni programmate.'
      )
      setUpcomingLessons([])
    } finally {
      setIsUpcomingLoading(false)
    }
  }, [isProfileLoading, tutorId])

  React.useEffect(() => {
    void loadUpcomingLessons()
  }, [loadUpcomingLessons])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='max-w-6xl mx-auto'>
          <h1 className='text-2xl font-bold mb-2'>
            {!isProfileLoading && `Bentornatə, ${profile?.firstName}`}
          </h1>
          <p className='text-muted-foreground mb-8'>
            Gestisci le tue lezioni da questa pagina.
          </p>
          {justOnboarded && (
            <div className='mb-8'>
              <PushInviteCard
                userId={profile?.id}
                role={profile?.role}
                title='Ti avvisiamo quando uno studente prenota'
                description='Hai scelto materie e orari: attiva le notifiche per sapere subito delle nuove prenotazioni.'
              />
            </div>
          )}

          <div className='grid gap-4 sm:gap-6 md:grid-cols-2'>
            <Link href='/tutor/settings/availability' className='group block'>
              <Card className='border py-4 sm:py-6'>
                <CardContent>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <Calendar className='h-4 w-4 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-md'>Disponibilità</CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground' />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href='/tutor/lessons/' className='group block'>
              <Card className='border py-4 sm:py-6'>
                <CardContent>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2.5'>
                        <BookOpen className='h-4 w-4 text-primary' />
                      </div>
                      <div>
                        <CardTitle className='text-md'>
                          Storico lezioni
                        </CardTitle>
                      </div>
                    </div>
                    <ChevronRight className='h-5 w-5 text-muted-foreground' />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <div className='mt-10 space-y-10'>
            <section>
              <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <h2 className='text-xl font-semibold'>Lezioni odierne</h2>
                </div>
                <div className='w-full sm:w-72'>
                  <Input
                    placeholder='Cerca per materia'
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value)
                      setPage(1)
                    }}
                  />
                </div>
              </div>

              <div className='mt-4 rounded-lg border'>
                <Table>
                  <TableHeader className='bg-muted/50'>
                    <TableRow>
                      <TableHead className='whitespace-nowrap'>
                        Data e ora
                      </TableHead>
                      <TableHead>Materia</TableHead>
                      <TableHead>Posti</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className='w-40'>
                        <span className='sr-only'>Azioni</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLessonsLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Caricamento...
                        </TableCell>
                      </TableRow>
                    ) : lessons.length ? (
                      lessons.map((lesson) => {
                        const subject = lessonSubject(lesson.subjectId, subjectMap)
                        return (
                          <TableRow key={lesson.id}>
                            <TableCell>
                              {formatItalianDate(lesson.startAt)}
                            </TableCell>
                            <TableCell>{subject?.name ?? '-'}</TableCell>
                            <TableCell>{lessonSeatsLabel(lesson)}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(lesson.status)}>
                                {formatStatusLabel(lesson.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className='w-40 text-right'>
                              <div className='flex items-center justify-end gap-1'>
                                <Button
                                  asChild
                                  size='sm'
                                  aria-label='Segna presenze'
                                >
                                  <Link href={`/tutor/lessons/${lesson.id}`}>
                                    Segna presenze
                                    <Check className='h-4 w-4' />
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Nessuna lezione oggi.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className='mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
                <span>
                  Pagina {page} di {totalPages} · Totale {total}
                  {searchQuery.trim() ? ' risultati per la ricerca' : ''}
                </span>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1 || isLessonsLoading}
                  >
                    Precedente
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={page >= totalPages || isLessonsLoading}
                  >
                    Successiva
                  </Button>
                </div>
              </div>
            </section>

            <section>
              <div className='flex items-center justify-between'>
                <h2 className='text-xl font-semibold'>Lezioni programmate</h2>
              </div>
              <div className='mt-4 rounded-lg border'>
                <Table>
                  <TableHeader className='bg-muted/50'>
                    <TableRow>
                      <TableHead className='whitespace-nowrap'>
                        Data e ora
                      </TableHead>
                      <TableHead>Materia</TableHead>
                      <TableHead>Posti</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className='w-16'>
                        <span className='sr-only'>Azioni</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isUpcomingLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Caricamento...
                        </TableCell>
                      </TableRow>
                    ) : upcomingLessons.length ? (
                      upcomingLessons.map((lesson) => {
                        const subject = lessonSubject(lesson.subjectId, subjectMap)
                        return (
                          <TableRow key={lesson.id}>
                            <TableCell>
                              {formatItalianDate(lesson.startAt)}
                            </TableCell>
                            <TableCell>{subject?.name ?? '-'}</TableCell>
                            <TableCell>{lessonSeatsLabel(lesson)}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(lesson.status)}>
                                {formatStatusLabel(lesson.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className='w-16 text-right'>
                              <div className='flex items-center justify-end gap-1'>
                                <Button
                                  asChild
                                  variant='ghost'
                                  size='icon'
                                  aria-label='Apri dettagli lezione'
                                  className='h-6 w-6 p-0'
                                >
                                  <Link href={`/tutor/lessons/${lesson.id}`}>
                                    <ExternalLink className='h-4 w-4' />
                                  </Link>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className='text-muted-foreground'
                        >
                          Nessuna lezione programmata.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
