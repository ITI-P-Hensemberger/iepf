'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CalendarIcon, MoreHorizontal } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

import { format } from 'date-fns'

import { formatItalianDate } from '@/lib/format-date'

const AVAILABLE_TIMES = ['13:00', '14:00', '15:00', '16:00']

type Lesson = {
  id: string
  tutorId: string
  subjectId: string
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity: number
  availableSeats: number
  countsForTutor?: boolean | null
  status: string
}

type Booking = {
  id: string
  lessonId: string
  studentId: string
  topic: string
  status: string
  studentPresence: boolean | null
  studentPresenceAt: string | null
  countsForStudent?: boolean | null
}

type Tutor = {
  id: string
  firstName: string
  lastName: string
}

type Student = {
  id: string
  firstName: string
  lastName: string
  year?: number | null
  sectionName?: string | null
}

type Subject = {
  id: string
  name: string
}

type PagedPayloadObject<T> = {
  items?: T[]
  total?: number
  data?: PagedPayloadObject<T>
  rows?: T[]
  results?: T[]
}

function normalizePaged<T>(payload: unknown): { items: T[]; total: number } {
  if (!payload) {
    return { items: [], total: 0 }
  }
  if (Array.isArray(payload)) {
    return { items: payload as T[], total: payload.length }
  }
  if (typeof payload !== 'object' || payload === null) {
    return { items: [], total: 0 }
  }

  const candidate = payload as PagedPayloadObject<T>
  const items = Array.isArray(candidate.items)
    ? candidate.items
    : Array.isArray(candidate.rows)
      ? candidate.rows
      : Array.isArray(candidate.results)
        ? candidate.results
        : Array.isArray((candidate as Record<string, unknown>).data)
          ? (candidate as Record<string, unknown>).data
          : []
  const total =
    typeof candidate.total === 'number'
      ? candidate.total
      : Array.isArray(candidate.items)
        ? candidate.items.length
        : Array.isArray(candidate.rows)
          ? candidate.rows.length
          : Array.isArray(candidate.results)
            ? candidate.results.length
            : Array.isArray(candidate.data?.items)
              ? candidate.data!.items!.length
              : Array.isArray(candidate.data?.rows)
                ? candidate.data!.rows!.length
                : Array.isArray(candidate.data?.results)
                  ? candidate.data!.results!.length
                  : 0
  return { items: items as T[], total }
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

function formatBookingStatus(status?: string | null) {
  if (!status) {
    return '-'
  }
  const normalized = status.toLowerCase()
  const mapping: Record<string, string> = {
    confirmed: 'Confermato',
    canceled: 'Annullato',
    cancelled: 'Annullato'
  }
  return mapping[normalized] ?? status
}

function countsBadgeLabel(value?: boolean | null) {
  if (value === true) {
    return 'Conteggiata'
  }
  if (value === false) {
    return 'Non conteggiata'
  }
  return '-'
}

function countsBadgeVariant(value?: boolean | null): 'default' | 'secondary' {
  return value ? 'default' : 'secondary'
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

function isCanceledStatus(status?: string | null) {
  if (!status) {
    return false
  }
  const normalized = status.toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

function timeFromDate(value?: string | null) {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  const hours = `${parsed.getHours()}`.padStart(2, '0')
  const minutes = `${parsed.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const combined = new Date(date)
  combined.setHours(hours || 0, minutes || 0, 0, 0)
  return combined
}

function isCanceledBooking(status?: string | null) {
  if (!status) {
    return false
  }
  const normalized = status.toLowerCase()
  return normalized === 'canceled' || normalized === 'cancelled'
}

function lessonOccupiedSeats(lesson?: Lesson | null) {
  if (!lesson || typeof lesson.availableSeats !== 'number') {
    return 0
  }
  return Math.max(0, lesson.lessonCapacity - lesson.availableSeats)
}

function tutorLabel(tutor?: Tutor | null) {
  if (!tutor) {
    return null
  }
  const label = `${tutor.lastName} ${tutor.firstName}`.trim()
  return label || tutor.id
}

function studentLabel(student?: Student) {
  if (!student) {
    return null
  }
  const label = `${student.lastName} ${student.firstName}`.trim()
  return label || student.id
}

function studentClassLabel(student?: Student) {
  if (!student) {
    return ''
  }
  const year =
    typeof student.year === 'number' && Number.isFinite(student.year)
      ? String(student.year)
      : ''
  const section =
    typeof student.sectionName === 'string'
      ? student.sectionName.replace(/\s+/g, '')
      : ''
  return `${year}${section}`.trim()
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.message === 'string') {
      return record.message
    }
    if (record.error && typeof record.error === 'object') {
      const error = record.error as Record<string, unknown>
      if (typeof error.message === 'string') {
        return error.message
      }
    }
  }
  return fallback
}

export default function AdminLessonDetailsPage() {
  const params = useParams()
  const lessonId = params?.id as string

  const [lesson, setLesson] = React.useState<Lesson | null>(null)
  const [lessonError, setLessonError] = React.useState<string | null>(null)
  const [lessonLoading, setLessonLoading] = React.useState(true)

  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = React.useState(true)
  const [bookingsError, setBookingsError] = React.useState<string | null>(null)
  const [bookingFilter, setBookingFilter] = React.useState<
    'confirmed' | 'canceled' | 'all'
  >('all')

  const [subject, setSubject] = React.useState<Subject | null>(null)
  const [subjectLoading, setSubjectLoading] = React.useState(false)
  const [tutor, setTutor] = React.useState<Tutor | null>(null)
  const [tutorLoading, setTutorLoading] = React.useState(false)
  const [studentMap, setStudentMap] = React.useState<Map<string, Student>>(
    () => new Map()
  )

  const [actionMessage, setActionMessage] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const [selectedBooking, setSelectedBooking] = React.useState<Booking | null>(
    null
  )
  const [presenceTarget, setPresenceTarget] = React.useState<Booking | null>(
    null
  )
  const [presenceValue, setPresenceValue] = React.useState<boolean | null>(null)
  const [isUpdatingPresence, setIsUpdatingPresence] = React.useState(false)

  const [topicTarget, setTopicTarget] = React.useState<Booking | null>(null)
  const [topicValue, setTopicValue] = React.useState('')
  const [isUpdatingTopic, setIsUpdatingTopic] = React.useState(false)

  const [cancelTarget, setCancelTarget] = React.useState<Booking | null>(null)
  const [isCanceling, setIsCanceling] = React.useState(false)
  const [cancelCountsForStudent, setCancelCountsForStudent] =
    React.useState(false)

  const [countsTarget, setCountsTarget] = React.useState<Booking | null>(null)
  const [countsValue, setCountsValue] = React.useState(false)
  const [isUpdatingCounts, setIsUpdatingCounts] = React.useState(false)

  const [lessonCountsOpen, setLessonCountsOpen] = React.useState(false)
  const [lessonCountsValue, setLessonCountsValue] = React.useState(false)
  const [isUpdatingLessonCounts, setIsUpdatingLessonCounts] =
    React.useState(false)

  const [isRescheduleOpen, setIsRescheduleOpen] = React.useState(false)
  const [isRescheduleDateOpen, setIsRescheduleDateOpen] = React.useState(false)
  const [rescheduleForm, setRescheduleForm] = React.useState({
    tutorId: '',
    subjectId: '',
    date: undefined as Date | undefined,
    time: '15:00'
  })
  const [rescheduleError, setRescheduleError] = React.useState<string | null>(
    null
  )
  const [isRescheduling, setIsRescheduling] = React.useState(false)
  const [rescheduleTutors, setRescheduleTutors] = React.useState<Tutor[]>([])
  const [rescheduleSubjects, setRescheduleSubjects] = React.useState<Subject[]>(
    []
  )
  const [rescheduleTutorsLoading, setRescheduleTutorsLoading] =
    React.useState(false)
  const [rescheduleSubjectsLoading, setRescheduleSubjectsLoading] =
    React.useState(false)

  const loadLesson = React.useCallback(async () => {
    setLessonLoading(true)
    setLessonError(null)
    try {
      const response = await fetch(`/api/lessons/${lessonId}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare la lezione.')
      }
      const payload = await response.json()
      setLesson(payload as Lesson)
    } catch (err) {
      setLessonError(
        err instanceof Error ? err.message : 'Impossibile caricare la lezione.'
      )
    } finally {
      setLessonLoading(false)
    }
  }, [lessonId])

  const loadBookings = React.useCallback(async () => {
    setBookingsLoading(true)
    setBookingsError(null)
    try {
      const response = await fetch(`/api/lessons/${lessonId}/bookings`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le prenotazioni.')
      }
      const payload = await response.json()
      const { items } = normalizePaged<Booking>(payload)
      setBookings(items)
    } catch (err) {
      setBookingsError(
        err instanceof Error
          ? err.message
          : 'Impossibile caricare le prenotazioni.'
      )
    } finally {
      setBookingsLoading(false)
    }
  }, [lessonId])

  const loadSubject = React.useCallback(async (subjectId: string) => {
    setSubjectLoading(true)
    try {
      const response = await fetch(`/api/subjects/${subjectId}`)
      if (!response.ok) {
        setSubject(null)
        return
      }
      const payload = await response.json()
      setSubject(payload as Subject)
    } catch {
      // ignore
    } finally {
      setSubjectLoading(false)
    }
  }, [])

  const loadTutor = React.useCallback(async (tutorId: string) => {
    setTutorLoading(true)
    try {
      const response = await fetch(`/api/users/${tutorId}`)
      if (!response.ok) {
        setTutor(null)
        return
      }
      const payload = await response.json()
      setTutor(payload as Tutor)
    } catch {
      // ignore
    } finally {
      setTutorLoading(false)
    }
  }, [])

  const loadRescheduleLists = React.useCallback(async () => {
    setRescheduleTutorsLoading(true)
    setRescheduleSubjectsLoading(true)
    try {
      const [tutorsResponse, subjectsResponse] = await Promise.all([
        fetch('/api/users?role=tutor&limit=200&offset=0'),
        fetch('/api/subjects')
      ])

      if (tutorsResponse.ok) {
        const payload = await tutorsResponse.json()
        const { items } = normalizePaged<Tutor>(payload)
        setRescheduleTutors(items)
      }

      if (subjectsResponse.ok) {
        const payload = await subjectsResponse.json()
        const { items } = normalizePaged<Subject>(payload)
        setRescheduleSubjects(items)
      }
    } catch {
      // ignore
    } finally {
      setRescheduleTutorsLoading(false)
      setRescheduleSubjectsLoading(false)
    }
  }, [])

  const sortedRescheduleTutors = React.useMemo(() => {
    return [...rescheduleTutors].sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName)
      if (lastNameCompare !== 0) {
        return lastNameCompare
      }
      return a.firstName.localeCompare(b.firstName)
    })
  }, [rescheduleTutors])

  const sortedRescheduleSubjects = React.useMemo(() => {
    return [...rescheduleSubjects].sort((a, b) => a.name.localeCompare(b.name))
  }, [rescheduleSubjects])

  React.useEffect(() => {
    void loadLesson()
    void loadBookings()
  }, [loadLesson, loadBookings])

  React.useEffect(() => {
    if (!lesson?.subjectId) {
      return
    }
    void loadSubject(lesson.subjectId)
  }, [lesson?.subjectId, loadSubject])

  React.useEffect(() => {
    if (!lesson?.tutorId) {
      return
    }
    void loadTutor(lesson.tutorId)
  }, [lesson?.tutorId, loadTutor])

  React.useEffect(() => {
    if (bookings.length === 0) {
      return
    }

    let isMounted = true
    const missingIds = Array.from(
      new Set(
        bookings
          .map((booking) => booking.studentId)
          .filter((id) => !studentMap.has(id))
      )
    )

    if (missingIds.length === 0) {
      return
    }

    async function loadMissingStudents() {
      const results = await Promise.allSettled(
        missingIds.map(async (id) => {
          const response = await fetch(`/api/users/${id}`)
          if (!response.ok) {
            return null
          }
          const payload = await response.json()
          return payload as Student
        })
      )

      if (!isMounted) {
        return
      }

      setStudentMap((prev) => {
        const next = new Map(prev)
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            next.set(result.value.id, result.value)
          }
        })
        return next
      })
    }

    void loadMissingStudents()

    return () => {
      isMounted = false
    }
  }, [bookings, studentMap])

  const handlePresence = React.useCallback(async () => {
    if (!presenceTarget || presenceValue === null) {
      return
    }

    setIsUpdatingPresence(true)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(
        `/api/lessons/${lessonId}/bookings/${presenceTarget.id}/presence`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ present: presenceValue })
        }
      )
      if (!response.ok) {
        let message = 'Impossibile aggiornare la presenza.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      setActionMessage('Presenza aggiornata.')
      setPresenceTarget(null)
      setPresenceValue(null)
      await loadBookings()
      await loadLesson()
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare la presenza.'
      )
    } finally {
      setIsUpdatingPresence(false)
    }
  }, [lessonId, loadBookings, loadLesson, presenceTarget, presenceValue])

  const handleTopicUpdate = React.useCallback(async () => {
    if (!topicTarget) {
      return
    }

    const nextTopic = topicValue.trim()
    if (!nextTopic) {
      setActionError('Inserisci un topic valido.')
      return
    }

    setIsUpdatingTopic(true)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(
        `/api/lessons/${lessonId}/bookings/${topicTarget.id}/topic`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ topic: nextTopic })
        }
      )
      if (!response.ok) {
        let message = 'Impossibile aggiornare il topic.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      setActionMessage('Topic aggiornato.')
      setTopicTarget(null)
      setTopicValue('')
      await loadBookings()
      await loadLesson()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Impossibile aggiornare il topic.'
      )
    } finally {
      setIsUpdatingTopic(false)
    }
  }, [lessonId, loadBookings, loadLesson, topicTarget, topicValue])

  const handleCancelBooking = React.useCallback(async () => {
    if (!cancelTarget) {
      return
    }

    setIsCanceling(true)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(
        `/api/lessons/${lessonId}/bookings/${cancelTarget.id}/cancel`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ countsForStudent: cancelCountsForStudent })
        }
      )
      if (!response.ok) {
        let message = 'Impossibile annullare la prenotazione.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      setActionMessage('Prenotazione annullata.')
      setCancelTarget(null)
      await loadBookings()
      await loadLesson()
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Impossibile annullare la prenotazione.'
      )
    } finally {
      setIsCanceling(false)
    }
  }, [cancelCountsForStudent, cancelTarget, lessonId, loadBookings, loadLesson])

  const handleOpenTopicDialog = React.useCallback((booking: Booking) => {
    setTopicTarget(booking)
    setTopicValue(booking.topic)
  }, [])

  const handleOpenCancelDialog = React.useCallback((booking: Booking) => {
    setCancelTarget(booking)
    setCancelCountsForStudent(Boolean(booking.countsForStudent))
  }, [])

  const handleOpenCountsDialog = React.useCallback((booking: Booking) => {
    setCountsTarget(booking)
    setCountsValue(Boolean(booking.countsForStudent))
  }, [])

  const handleUpdateCounts = React.useCallback(async () => {
    if (!countsTarget) {
      return
    }

    setIsUpdatingCounts(true)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(
        `/api/lessons/${lessonId}/bookings/${countsTarget.id}/counts`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ countsForStudent: countsValue })
        }
      )
      if (!response.ok) {
        let message = 'Impossibile aggiornare il conteggio.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      setActionMessage('Conteggio aggiornato.')
      setCountsTarget(null)
      await loadBookings()
      await loadLesson()
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare il conteggio.'
      )
    } finally {
      setIsUpdatingCounts(false)
    }
  }, [countsTarget, countsValue, lessonId, loadBookings, loadLesson])

  const handleUpdateLessonCounts = React.useCallback(async () => {
    if (!lesson) {
      return
    }

    setIsUpdatingLessonCounts(true)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/counts`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ countsForTutor: lessonCountsValue })
      })
      if (!response.ok) {
        let message = 'Impossibile aggiornare il conteggio tutor.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      setActionMessage('Conteggio tutor aggiornato.')
      setLessonCountsOpen(false)
      await loadLesson()
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare il conteggio tutor.'
      )
    } finally {
      setIsUpdatingLessonCounts(false)
    }
  }, [lesson, lessonCountsValue, loadLesson])

  const handleOpenReschedule = React.useCallback(() => {
    if (!lesson) {
      return
    }
    const defaultTime = timeFromDate(lesson.startAt)
    const timeValue =
      defaultTime && AVAILABLE_TIMES.includes(defaultTime)
        ? defaultTime
        : '15:00'
    setRescheduleForm({
      tutorId: lesson.tutorId,
      subjectId: lesson.subjectId,
      date: new Date(lesson.startAt),
      time: timeValue
    })
    setRescheduleError(null)
    void loadRescheduleLists()
    setIsRescheduleOpen(true)
  }, [lesson, loadRescheduleLists])

  const handleReschedule = React.useCallback(async () => {
    if (!lesson) {
      return
    }
    setRescheduleError(null)
    if (!rescheduleForm.tutorId.trim()) {
      setRescheduleError('Seleziona un tutor valido.')
      return
    }
    if (!rescheduleForm.subjectId.trim()) {
      setRescheduleError('Seleziona una materia valida.')
      return
    }
    if (!rescheduleForm.date) {
      setRescheduleError('Inserisci una data valida.')
      return
    }
    const timeValue = AVAILABLE_TIMES.includes(rescheduleForm.time)
      ? rescheduleForm.time
      : '15:00'
    const startAtIso = combineDateAndTime(
      rescheduleForm.date,
      timeValue
    ).toISOString()

    setIsRescheduling(true)
    setActionMessage(null)
    setActionError(null)

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tutorId: rescheduleForm.tutorId,
          subjectId: rescheduleForm.subjectId,
          startAt: startAtIso,
          durationMinutes: 60
        })
      })
      if (!response.ok) {
        let message = 'Impossibile riprogrammare la lezione.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      setActionMessage('Lezione riprogrammata.')
      setIsRescheduleOpen(false)
      await loadLesson()
      await loadBookings()
    } catch (err) {
      setRescheduleError(
        err instanceof Error
          ? err.message
          : 'Impossibile riprogrammare la lezione.'
      )
    } finally {
      setIsRescheduling(false)
    }
  }, [lesson, loadBookings, loadLesson, rescheduleForm])

  const filteredBookings = React.useMemo(() => {
    if (bookingFilter === 'all') {
      return bookings
    }
    if (bookingFilter === 'canceled') {
      return bookings.filter((booking) => isCanceledBooking(booking.status))
    }
    return bookings.filter((booking) => !isCanceledBooking(booking.status))
  }, [bookingFilter, bookings])

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl space-y-6'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-2xl'>Dettagli lezione</h1>
              <p className='text-sm text-muted-foreground'>
                Gestisci prenotazioni e presenze.
              </p>
            </div>
            <Button asChild variant='outline'>
              <Link href='/admin/lessons'>Torna alle lezioni</Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <CardTitle>
                  Lezione <br />
                  <span className='text-sm text-muted-foreground'>
                    Riepilogo della lezione selezionata.
                  </span>
                </CardTitle>
                <div className='flex flex-col gap-2 sm:flex-row sm:items-center mt-2 sm:mt-0'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleOpenReschedule}
                    disabled={!lesson}
                  >
                    Riprogramma
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setLessonCountsValue(Boolean(lesson?.countsForTutor))
                      setLessonCountsOpen(true)
                    }}
                    disabled={!lesson}
                  >
                    Modifica conteggio tutor
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {lessonLoading ? (
                <p className='text-sm text-muted-foreground'>Caricamento...</p>
              ) : lesson ? (
                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                  <div>
                    <p className='text-xs text-muted-foreground'>Data</p>
                    <p className='text-sm'>
                      {formatItalianDate(lesson.startAt)}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Tutor</p>
                    <p className='text-sm'>
                      {tutorLoading
                        ? 'Caricamento...'
                        : (tutorLabel(tutor) ?? '-')}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Materia</p>
                    <p className='text-sm'>
                      {subjectLoading
                        ? 'Caricamento...'
                        : (subject?.name ?? '-')}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Posti occupati
                    </p>
                    <p className='text-sm'>
                      {lessonOccupiedSeats(lesson)}/{lesson.lessonCapacity}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Capienza giornaliera tutor
                    </p>
                    <p className='text-sm'>
                      {lessonOccupiedSeats(lesson)}/{lesson.dailyCapacity}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Conteggio tutor
                    </p>
                    <Badge variant={countsBadgeVariant(lesson.countsForTutor)}>
                      {countsBadgeLabel(lesson.countsForTutor)}
                    </Badge>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Stato</p>
                    <Badge variant={statusVariant(lesson.status)}>
                      {formatStatusLabel(lesson.status)}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className='text-sm text-destructive'>
                  {lessonError ?? 'Lezione non trovata.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prenotazioni</CardTitle>
              <CardDescription>
                {bookingsLoading
                  ? 'Caricamento prenotazioni...'
                  : `Totale ${bookings.length} prenotazioni`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div className='text-sm text-muted-foreground'>
                  {bookingsLoading
                    ? ' '
                    : `Mostrando ${filteredBookings.length} prenotazioni`}
                </div>
                <div className='w-full sm:w-56'>
                  <Select
                    value={bookingFilter}
                    onValueChange={(value) =>
                      setBookingFilter(
                        value === 'all' || value === 'canceled'
                          ? value
                          : 'confirmed'
                      )
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Filtra prenotazioni' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='confirmed'>Confermate</SelectItem>
                      <SelectItem value='canceled'>Annullate</SelectItem>
                      <SelectItem value='all'>Tutte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className='rounded-lg border'>
                <Table>
                  <TableHeader className='bg-muted/50'>
                    <TableRow>
                      <TableHead>Studente</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Presenza</TableHead>
                      <TableHead>Conteggio</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingsLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className='text-muted-foreground'
                        >
                          Caricamento...
                        </TableCell>
                      </TableRow>
                    ) : filteredBookings.length ? (
                      filteredBookings.map((booking) => {
                        const student = studentMap.get(booking.studentId)
                        return (
                          <TableRow key={booking.id}>
                            <TableCell>
                              {student ? (
                                <div className='flex flex-col'>
                                  <span>{studentLabel(student)}</span>
                                  {studentClassLabel(student) && (
                                    <span className='text-xs text-muted-foreground'>
                                      {studentClassLabel(student)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                'Caricamento...'
                              )}
                            </TableCell>
                            <TableCell>{booking.topic}</TableCell>
                            <TableCell>
                              {booking.studentPresence === null
                                ? '-'
                                : booking.studentPresence
                                  ? 'Presente'
                                  : 'Assente'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={countsBadgeVariant(
                                  booking.countsForStudent
                                )}
                              >
                                {countsBadgeLabel(booking.countsForStudent)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(booking.status)}>
                                {formatBookingStatus(booking.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <DropdownMenu
                                open={selectedBooking?.id === booking.id}
                                onOpenChange={(open) =>
                                  setSelectedBooking(open ? booking : null)
                                }
                              >
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant='ghost'
                                    size='icon'
                                    className='h-6 w-6 p-0'
                                    aria-label='Azioni'
                                  >
                                    <MoreHorizontal className='h-4 w-4' />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end'>
                                  <DropdownMenuItem asChild>
                                    <a
                                      href={`/admin/students/${booking.studentId}`}
                                      target='_blank'
                                      rel='noreferrer'
                                    >
                                      Apri profilo studente
                                    </a>
                                  </DropdownMenuItem>
                                  {!isCanceledBooking(booking.status) &&
                                    !isCanceledStatus(lesson?.status) && (
                                      <DropdownMenuItem
                                        onSelect={() => {
                                          setPresenceTarget(booking)
                                          setPresenceValue(true)
                                        }}
                                      >
                                        Segna presente
                                      </DropdownMenuItem>
                                    )}
                                  {!isCanceledBooking(booking.status) &&
                                    !isCanceledStatus(lesson?.status) && (
                                      <DropdownMenuItem
                                        onSelect={() => {
                                          setPresenceTarget(booking)
                                          setPresenceValue(false)
                                        }}
                                      >
                                        Segna assente
                                      </DropdownMenuItem>
                                    )}
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleOpenTopicDialog(booking)
                                    }
                                  >
                                    Modifica topic
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleOpenCountsDialog(booking)
                                    }
                                  >
                                    Modifica conteggio
                                  </DropdownMenuItem>
                                  {!isCanceledBooking(booking.status) &&
                                    !isCanceledStatus(lesson?.status) && (
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          handleOpenCancelDialog(booking)
                                        }
                                      >
                                        Annulla prenotazione
                                      </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className='text-muted-foreground'
                        >
                          Nessuna prenotazione.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {bookingsError && (
                <p className='mt-3 text-sm text-destructive'>{bookingsError}</p>
              )}
              {(actionMessage || actionError) && (
                <div className='mt-3 space-y-1'>
                  {actionMessage && (
                    <p className='text-sm text-emerald-600'>{actionMessage}</p>
                  )}
                  {actionError && (
                    <p className='text-sm text-destructive'>{actionError}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={presenceTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPresenceTarget(null)
            setPresenceValue(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma presenza</AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi impostare lo stato di presenza per lo studente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handlePresence()
              }}
              disabled={isUpdatingPresence}
            >
              {isUpdatingPresence ? 'Salvataggio...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={topicTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTopicTarget(null)
            setTopicValue('')
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifica topic</AlertDialogTitle>
            <AlertDialogDescription>
              Aggiorna il topic della prenotazione selezionata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-2'>
            <Input
              value={topicValue}
              onChange={(event) => setTopicValue(event.target.value)}
              placeholder='Inserisci il topic'
            />
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleTopicUpdate()
              }}
              disabled={isUpdatingTopic}
            >
              {isUpdatingTopic ? 'Salvataggio...' : 'Salva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla prenotazione</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi l&apos;annullamento della prenotazione selezionata?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex items-center gap-3'>
            <Checkbox
              id='cancel-counts-student'
              checked={cancelCountsForStudent}
              onCheckedChange={(value) =>
                setCancelCountsForStudent(Boolean(value))
              }
            />
            <Label htmlFor='cancel-counts-student'>
              Conteggia per lo studente
            </Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCancelBooking()
              }}
              disabled={isCanceling}
            >
              {isCanceling ? 'Annullamento...' : 'Conferma'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={countsTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCountsTarget(null)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifica conteggio</AlertDialogTitle>
            <AlertDialogDescription>
              Imposta se la prenotazione deve essere conteggiata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex items-center gap-3'>
            <Checkbox
              id='booking-counts-student'
              checked={countsValue}
              onCheckedChange={(value) => setCountsValue(Boolean(value))}
            />
            <Label htmlFor='booking-counts-student'>
              Conteggia per lo studente
            </Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleUpdateCounts()
              }}
              disabled={isUpdatingCounts}
            >
              {isUpdatingCounts ? 'Salvataggio...' : 'Salva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={lessonCountsOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLessonCountsOpen(false)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Conteggio tutor</AlertDialogTitle>
            <AlertDialogDescription>
              Imposta se la lezione deve essere conteggiata per il tutor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex items-center gap-3'>
            <Checkbox
              id='lesson-counts-tutor'
              checked={lessonCountsValue}
              onCheckedChange={(value) => setLessonCountsValue(Boolean(value))}
            />
            <Label htmlFor='lesson-counts-tutor'>Conteggia per il tutor</Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleUpdateLessonCounts()
              }}
              disabled={isUpdatingLessonCounts}
            >
              {isUpdatingLessonCounts ? 'Salvataggio...' : 'Salva'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isRescheduleOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRescheduleError(null)
          }
          setIsRescheduleOpen(open)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-xl'>
          <AlertDialogHeader>
            <AlertDialogTitle>Riprogramma lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Modifica i dettagli della lezione selezionata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field className='gap-2'>
                <Label htmlFor='reschedule-tutor'>Tutor</Label>
                <Select
                  value={rescheduleForm.tutorId || '__none__'}
                  onValueChange={(value) =>
                    setRescheduleForm((prev) => ({
                      ...prev,
                      tutorId: value === '__none__' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger id='reschedule-tutor' className='w-full'>
                    <SelectValue
                      placeholder={
                        rescheduleTutorsLoading
                          ? 'Caricamento...'
                          : 'Seleziona tutor'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>Seleziona tutor</SelectItem>
                    {sortedRescheduleTutors.map((tutor) => (
                      <SelectItem key={tutor.id} value={tutor.id}>
                        {tutorLabel(tutor) ?? 'Caricamento...'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <Label htmlFor='reschedule-subject'>Materia</Label>
                <Select
                  value={rescheduleForm.subjectId || '__none__'}
                  onValueChange={(value) =>
                    setRescheduleForm((prev) => ({
                      ...prev,
                      subjectId: value === '__none__' ? '' : value
                    }))
                  }
                >
                  <SelectTrigger id='reschedule-subject' className='w-full'>
                    <SelectValue
                      placeholder={
                        rescheduleSubjectsLoading
                          ? 'Caricamento...'
                          : 'Seleziona materia'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>Seleziona materia</SelectItem>
                    {sortedRescheduleSubjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className='gap-2'>
                <Label htmlFor='reschedule-date-time'>Data e ora</Label>
                <Button
                  variant='outline'
                  id='reschedule-date-time'
                  className='w-full justify-start px-2.5 font-normal'
                  onClick={() => setIsRescheduleDateOpen(true)}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {rescheduleForm.date ? (
                    <>
                      {format(rescheduleForm.date, 'dd/MM/yyyy')}{' '}
                      {rescheduleForm.time}
                    </>
                  ) : (
                    <span>Seleziona data</span>
                  )}
                </Button>
              </Field>
            </div>
            {rescheduleError && (
              <div className='rounded-md border border-destructive/50 bg-destructive/10 p-3'>
                <p className='text-sm text-destructive'>{rescheduleError}</p>
              </div>
            )}
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleReschedule()
              }}
              disabled={isRescheduling}
            >
              {isRescheduling ? 'Salvataggio...' : 'Salva modifiche'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isRescheduleDateOpen}
        onOpenChange={setIsRescheduleDateOpen}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-md'>
          <AlertDialogHeader>
            <AlertDialogTitle>Seleziona data e ora</AlertDialogTitle>
            <AlertDialogDescription>
              Scegli la nuova data e l&apos;orario della lezione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='flex justify-center'>
              <Calendar
                mode='single'
                selected={rescheduleForm.date}
                onSelect={(date) =>
                  setRescheduleForm((prev) => ({
                    ...prev,
                    date: date ?? undefined
                  }))
                }
                defaultMonth={rescheduleForm.date ?? new Date()}
                initialFocus
              />
            </div>
            <Field className='gap-2'>
              <Label htmlFor='reschedule-time-dialog'>Orario</Label>
              <Select
                value={rescheduleForm.time}
                onValueChange={(value) =>
                  setRescheduleForm((prev) => ({ ...prev, time: value }))
                }
              >
                <SelectTrigger id='reschedule-time-dialog' className='w-full'>
                  <SelectValue placeholder='Seleziona orario' />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Chiudi</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                setIsRescheduleDateOpen(false)
              }}
            >
              Applica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
