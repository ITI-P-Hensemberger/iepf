'use client'

import { SegmentedTabs } from '@/components/segmented-tabs'
import { useHere, withFrom } from '@/lib/back-link'
import { EmptyState } from '@/components/empty-state'
import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  CalendarClock,
  CalendarIcon,
  Mail,
  MessageSquare,
  MoreHorizontal,
  UserPlus,
  XCircle
} from 'lucide-react'

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
import { LessonSummary } from '@/components/lesson-summary'
import { PresenceButtons } from '@/components/presence-buttons'
import { usePresenceConfirm } from '@/components/presence-confirm'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

import { format } from 'date-fns'
import { toast } from 'sonner'

import { classLabel } from '@/lib/class-label'
import { formatItalianDate } from '@/lib/format-date'
import { dayKeyOf } from '@/lib/school-week'
import { cn } from '@/lib/utils'
import { type SubjectOption } from '@/lib/lesson-subject'
import { extractPayloadArray } from '@/lib/backend-response'
import { PageHeader } from '@/components/page-header'
import { capitalizeFirst } from '@/lib/capitalize'

const AVAILABLE_TIMES = ['13:00', '14:00', '15:00', '16:00']
// Reschedule choice that leaves the subject to the bookings, as on generated lessons.
const OPEN_SUBJECT_VALUE = '__open__'

type Lesson = {
  id: string
  tutorId: string
  subjectId: string | null
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyCapacity?: number | null
  dailyOccupancy?: number | null
  availableSeats: number
  countsForTutor?: boolean | null
  status: string
  // True when bookings choose the subject: subjectId stays null until the first one.
  subjectFromBooking?: boolean
  subjectOptions?: SubjectOption[]
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
  email?: string | null
  year?: number | null
  sectionName?: string | null
}

type Student = {
  id: string
  firstName: string
  lastName: string
  email?: string | null
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

function parseNumeric(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function lessonDailySeatsLabel(lesson?: Lesson | null) {
  if (!lesson) {
    return '-'
  }
  const occupancy = parseNumeric(lesson.dailyOccupancy)
  const availability = parseNumeric(lesson.dailyCapacity)
  if (occupancy === null || availability === null) {
    return '-'
  }
  return `${Math.max(0, occupancy)}/${availability}`
}

function tutorClassLabel(tutor: Tutor) {
  return classLabel(tutor.year, tutor.sectionName)
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
  return student ? classLabel(student.year, student.sectionName) ?? '' : ''
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
  const here = useHere()
  const lessonId = params?.id as string

  const [lesson, setLesson] = React.useState<Lesson | null>(null)
  const [lessonLoading, setLessonLoading] = React.useState(true)

  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = React.useState(true)
  const [bookingFilter, setBookingFilter] = React.useState<
    'confirmed' | 'canceled' | 'all'
  >('all')

  const [subject, setSubject] = React.useState<Subject | null>(null)
  const [subjectLoading, setSubjectLoading] = React.useState(false)
  // An open lesson has no subject until a booking picks one of its tutor's.
  const subjectLabel =
    lesson && !lesson.subjectId ? '-' : (subject?.name ?? '-')
  const bookingSubjectOptions = lesson?.subjectOptions ?? []
  const [tutor, setTutor] = React.useState<Tutor | null>(null)
  const [tutorLoading, setTutorLoading] = React.useState(false)
  const [studentMap, setStudentMap] = React.useState<Map<string, Student>>(
    () => new Map()
  )

  const [selectedBooking, setSelectedBooking] = React.useState<Booking | null>(
    null
  )
  const [presenceSaving, setPresenceSaving] = React.useState<
    Record<string, boolean>
  >({})

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

  const [cancelLessonOpen, setCancelLessonOpen] = React.useState(false)
  const [cancelLessonCountsForTutor, setCancelLessonCountsForTutor] =
    React.useState(false)
  const [isCancellingLesson, setIsCancellingLesson] = React.useState(false)

  const [isRescheduleOpen, setIsRescheduleOpen] = React.useState(false)
  const [isRescheduleDateOpen, setIsRescheduleDateOpen] = React.useState(false)
  const [rescheduleForm, setRescheduleForm] = React.useState({
    tutorId: '',
    subjectId: '',
    date: undefined as Date | undefined,
    time: '15:00'
  })
  const [isRescheduling, setIsRescheduling] = React.useState(false)
  const [rescheduleTutors, setRescheduleTutors] = React.useState<Tutor[]>([])
  const [rescheduleSubjects, setRescheduleSubjects] = React.useState<Subject[]>(
    []
  )
  const [rescheduleTutorsLoading, setRescheduleTutorsLoading] =
    React.useState(false)
  const [rescheduleSubjectsLoading, setRescheduleSubjectsLoading] =
    React.useState(false)
  const [rescheduleTutorSubjectIds, setRescheduleTutorSubjectIds] =
    React.useState<Set<string>>(new Set())
  const [rescheduleTutorSubjectsLoading, setRescheduleTutorSubjectsLoading] =
    React.useState(false)

  const [bookStudentOpen, setBookStudentOpen] = React.useState(false)
  const [studentsLoading, setStudentsLoading] = React.useState(false)
  const [students, setStudents] = React.useState<Student[]>([])
  const [studentSearch, setStudentSearch] = React.useState('')
  const [selectedStudentId, setSelectedStudentId] = React.useState('')
  const [bookingTopic, setBookingTopic] = React.useState('')
  const [bookingSubjectId, setBookingSubjectId] = React.useState('')
  const [isCreatingBooking, setIsCreatingBooking] = React.useState(false)

  const loadLesson = React.useCallback(async () => {
    setLessonLoading(true)
    try {
      const response = await fetch(`/api/lessons/${lessonId}`)
      if (!response.ok) {
        throw new Error('Impossibile caricare la lezione.')
      }
      const payload = await response.json()
      setLesson(payload as Lesson)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile caricare la lezione.'
      )
    } finally {
      setLessonLoading(false)
    }
  }, [lessonId])

  const loadBookings = React.useCallback(async () => {
    setBookingsLoading(true)
    try {
      const response = await fetch(`/api/lessons/${lessonId}/bookings`)
      if (!response.ok) {
        throw new Error('Impossibile caricare le prenotazioni.')
      }
      const payload = await response.json()
      const { items } = normalizePaged<Booking>(payload)
      setBookings(items)
    } catch (err) {
      toast.error(
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

  React.useEffect(() => {
    if (!isRescheduleOpen || !rescheduleForm.tutorId) {
      setRescheduleTutorSubjectIds(new Set())
      return
    }

    let isMounted = true

    async function loadTutorSubjects() {
      setRescheduleTutorSubjectsLoading(true)
      try {
        const response = await fetch(
          `/api/tutors/${rescheduleForm.tutorId}/subjects`
        )
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        const items = extractPayloadArray<Subject>(payload)
        const resolvedItems =
          items.length === 0 &&
          payload &&
          typeof payload === 'object' &&
          'data' in payload
            ? extractPayloadArray<Subject>(
                (payload as { data?: unknown }).data
              )
            : items
        if (isMounted) {
          const ids = resolvedItems
            .map((item) => {
              const candidate = item as Subject & {
                subjectId?: string
                subject?: { id?: string } | null
              }
              return (
                candidate.id ||
                candidate.subjectId ||
                candidate.subject?.id ||
                ''
              )
            })
            .filter((value) => value)
          setRescheduleTutorSubjectIds(new Set(ids))
        }
      } catch {
        if (isMounted) {
          setRescheduleTutorSubjectIds(new Set())
        }
      } finally {
        if (isMounted) {
          setRescheduleTutorSubjectsLoading(false)
        }
      }
    }

    void loadTutorSubjects()

    return () => {
      isMounted = false
    }
  }, [isRescheduleOpen, rescheduleForm.tutorId])

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

  const rescheduleSubjectSplit = React.useMemo(() => {
    if (!rescheduleTutorSubjectIds.size) {
      return {
        preferred: [] as Subject[],
        others: sortedRescheduleSubjects
      }
    }
    const preferred: Subject[] = []
    const others: Subject[] = []
    sortedRescheduleSubjects.forEach((subject) => {
      if (rescheduleTutorSubjectIds.has(subject.id)) {
        preferred.push(subject)
      } else {
        others.push(subject)
      }
    })
    return { preferred, others }
  }, [rescheduleTutorSubjectIds, sortedRescheduleSubjects])

  const loadStudents = React.useCallback(async () => {
    setStudentsLoading(true)
    try {
      const response = await fetch('/api/users?role=student&limit=200&offset=0')
      if (!response.ok) {
        throw new Error('Impossibile caricare gli studenti.')
      }
      const payload = await response.json()
      const { items } = normalizePaged<Student>(payload)
      setStudents(items)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile caricare gli studenti.'
      )
    } finally {
      setStudentsLoading(false)
    }
  }, [])

  const sortedStudents = React.useMemo(() => {
    return [...students].sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName)
      if (lastNameCompare !== 0) {
        return lastNameCompare
      }
      return a.firstName.localeCompare(b.firstName)
    })
  }, [students])

  const filteredStudents = React.useMemo(() => {
    const query = studentSearch.trim().toLowerCase()
    if (!query) {
      return sortedStudents
    }
    return sortedStudents.filter((student) => {
      const label = studentLabel(student)?.toLowerCase() ?? ''
      const klass = studentClassLabel(student)?.toLowerCase() ?? ''
      const email = student.email?.toLowerCase() ?? ''
      return (
        label.includes(query) || klass.includes(query) || email.includes(query)
      )
    })
  }, [sortedStudents, studentSearch])

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

  React.useEffect(() => {
    if (!bookStudentOpen || students.length > 0) {
      return
    }
    void loadStudents()
  }, [bookStudentOpen, loadStudents, students.length])

  const handlePresenceSave = React.useCallback(
    async (booking: Booking, value: boolean | null) => {
      setPresenceSaving((prev) => ({ ...prev, [booking.id]: true }))

      try {
        const response = await fetch(
          `/api/lessons/${lessonId}/bookings/${booking.id}/presence`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ present: value })
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
        toast.success('Presenza aggiornata.')
        await loadBookings()
        await loadLesson()
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Impossibile aggiornare la presenza.'
        )
      } finally {
        setPresenceSaving((prev) => ({ ...prev, [booking.id]: false }))
      }
    },
    [lessonId, loadBookings, loadLesson]
  )

  const handleCreateBooking = React.useCallback(async () => {
    if (!selectedStudentId) {
      return
    }
    setIsCreatingBooking(true)
    try {
      const response = await fetch(`/api/lessons/${lessonId}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          studentId: selectedStudentId,
          topic: bookingTopic.trim() ? bookingTopic.trim() : undefined,
          subjectId: bookingSubjectId || undefined
        })
      })
      if (!response.ok) {
        let message = 'Impossibile creare la prenotazione.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      toast.success('Prenotazione creata.')
      setBookStudentOpen(false)
      setSelectedStudentId('')
      setBookingTopic('')
      setBookingSubjectId('')
      setStudentSearch('')
      await loadBookings()
      await loadLesson()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile creare la prenotazione.'
      )
    } finally {
      setIsCreatingBooking(false)
    }
  }, [bookingSubjectId, bookingTopic, lessonId, loadBookings, loadLesson, selectedStudentId])

  const handleTopicUpdate = React.useCallback(async () => {
    if (!topicTarget) {
      return
    }

    const nextTopic = topicValue.trim()
    if (!nextTopic) {
      toast.error("Inserisci un argomento valido.")
      return
    }

    setIsUpdatingTopic(true)

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
        let message = "Impossibile aggiornare l'argomento."
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      toast.success('Argomento aggiornato.')
      setTopicTarget(null)
      setTopicValue('')
      await loadBookings()
      await loadLesson()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Impossibile aggiornare l'argomento."
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
      toast.success('Prenotazione annullata.')
      setCancelTarget(null)
      await loadBookings()
      await loadLesson()
    } catch (err) {
      toast.error(
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
      toast.success('Conteggio aggiornato.')
      setCountsTarget(null)
      await loadBookings()
      await loadLesson()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossibile aggiornare il conteggio.'
      )
    } finally {
      setIsUpdatingCounts(false)
    }
  }, [countsTarget, countsValue, lessonId, loadBookings, loadLesson])

  const handleCancelLesson = React.useCallback(async () => {
    if (!lesson) {
      return
    }

    setIsCancellingLesson(true)

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          countsForTutor: cancelLessonCountsForTutor
        })
      })
      if (!response.ok) {
        let message = 'Impossibile annullare la lezione.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      toast.success('Lezione annullata.')
      setCancelLessonOpen(false)
      await loadLesson()
      await loadBookings()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossibile annullare la lezione.'
      )
    } finally {
      setIsCancellingLesson(false)
    }
  }, [cancelLessonCountsForTutor, lesson, loadBookings, loadLesson])

  const handleUpdateLessonCounts = React.useCallback(async () => {
    if (!lesson) {
      return
    }

    setIsUpdatingLessonCounts(true)

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
      toast.success('Conteggio tutor aggiornato.')
      setLessonCountsOpen(false)
      await loadLesson()
    } catch (err) {
      toast.error(
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
      subjectId: lesson.subjectFromBooking
        ? OPEN_SUBJECT_VALUE
        : (lesson.subjectId ?? ''),
      date: new Date(lesson.startAt),
      time: timeValue
    })
    void loadRescheduleLists()
    setIsRescheduleOpen(true)
  }, [lesson, loadRescheduleLists])

  const handleReschedule = React.useCallback(async () => {
    if (!lesson) {
      return
    }
    if (!rescheduleForm.tutorId.trim()) {
      toast.error('Seleziona un tutor valido.')
      return
    }
    if (!rescheduleForm.subjectId.trim()) {
      toast.error('Seleziona una materia valida.')
      return
    }
    if (!rescheduleForm.date) {
      toast.error('Inserisci una data valida.')
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

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tutorId: rescheduleForm.tutorId,
          subjectId:
            rescheduleForm.subjectId === OPEN_SUBJECT_VALUE
              ? null
              : rescheduleForm.subjectId,
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
      toast.success('Lezione riprogrammata.')
      setIsRescheduleOpen(false)
      await loadLesson()
      await loadBookings()
    } catch (err) {
      toast.error(
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

  const bookedCount = bookings.filter((booking) => !isCanceledBooking(booking.status)).length
  const lessonCanceled = isCanceledStatus(lesson?.status)
  const presence = usePresenceConfirm()

  // Without ?from=, back leads to the day of this lesson.
  const backFallback = lesson ? `/admin/lessons?day=${dayKeyOf(new Date(lesson.startAt))}` : '/admin/lessons'

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10'>
        <div className='mx-auto max-w-6xl space-y-6'>
          {lessonLoading && !lesson ? (
            <>
              <PageHeader title='Lezione' backHref={backFallback} />
              <Skeleton className='h-16' />
            </>
          ) : !lesson ? (
            <>
              <PageHeader title='Lezione' backHref={backFallback} />
              <EmptyState>Lezione non disponibile.</EmptyState>
            </>
          ) : (
            <LessonSummary
              backHref={backFallback}
              subjectName={lesson.subjectId ? (subjectLoading ? '…' : subject?.name ?? null) : null}
              startAt={lesson.startAt}
              durationMinutes={lesson.durationMinutes}
              status={lesson.status}
              booked={bookedCount}
              seats={lesson.lessonCapacity}
              note={!lesson.subjectId && bookingSubjectOptions.length > 0
                ? `La materia la sceglie il primo studente che prenota, tra: ${bookingSubjectOptions.map((option) => option.name).join(', ')}.`
                : undefined}
              actions={(
                <>
                  {!lessonCanceled && (
                    <Button onClick={() => setBookStudentOpen(true)}>
                      <UserPlus className='h-4 w-4' /> Prenota per uno studente
                    </Button>
                  )}
                  {!lessonCanceled && (
                    <Button variant='outline' onClick={handleOpenReschedule}>
                      <CalendarClock className='h-4 w-4' /> Riprogramma
                    </Button>
                  )}
                  <Button asChild variant='outline'>
                    <Link href={withFrom(`/admin/feedback?feedbackLesson=${lesson.id}&feedbackRole=tutor`, here)}>
                      <MessageSquare className='h-4 w-4' /> Feedback
                    </Link>
                  </Button>
                  {!lessonCanceled && (
                    <Button
                      variant='outline'
                      className='border-destructive/50 text-destructive hover:text-destructive'
                      onClick={() => {
                        setCancelLessonCountsForTutor(Boolean(lesson.countsForTutor))
                        setCancelLessonOpen(true)
                      }}
                    >
                      <XCircle className='h-4 w-4' /> Annulla lezione
                    </Button>
                  )}
                </>
              )}
            />
          )}

          {lesson && (
            <section className='space-y-3 rounded-lg border bg-card p-4 sm:p-6'>
              <h2 className='text-lg font-semibold'>Tutor</h2>
              {tutorLoading && !tutor ? (
                <Skeleton className='h-12' />
              ) : tutor ? (
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='space-y-1'>
                    <Link className='font-medium text-[var(--primary-text)] hover:underline' href={withFrom(`/admin/tutors/${tutor.id}`, here)}>
                      {tutor.firstName} {tutor.lastName}
                    </Link>
                    {tutorClassLabel(tutor) && <div className='text-sm text-muted-foreground'>{tutorClassLabel(tutor)}</div>}
                    <div className='text-sm text-muted-foreground'>Posti del giorno: {lessonDailySeatsLabel(lesson)}</div>
                    <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                      Lezione conteggiata per il tutor:
                      <Badge variant={countsBadgeVariant(lesson.countsForTutor)}>{countsBadgeLabel(lesson.countsForTutor)}</Badge>
                    </div>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {tutor.email && (
                      <Button asChild variant='outline' size='sm'>
                        <a href={`mailto:${tutor.email}`}><Mail className='h-4 w-4' /> Scrivi</a>
                      </Button>
                    )}
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setLessonCountsValue(Boolean(lesson.countsForTutor))
                        setLessonCountsOpen(true)
                      }}
                    >
                      Modifica conteggio
                    </Button>
                  </div>
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>Tutor non trovato.</p>
              )}
            </section>
          )}

          <section className='space-y-3'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <h2 className='text-lg font-semibold'>Studenti</h2>
              <SegmentedTabs
                label='Prenotazioni'
                value={bookingFilter}
                onValueChange={(value) => setBookingFilter(value as typeof bookingFilter)}
                options={[{ value: 'confirmed', label: 'Confermate' }, { value: 'canceled', label: 'Annullate' }, { value: 'all', label: 'Tutte' }]}
              />
            </div>
            {bookingsLoading ? (
              <Skeleton className='h-24' />
            ) : filteredBookings.length === 0 ? (
              <EmptyState>
                {bookingFilter === 'canceled' ? 'Nessuna prenotazione annullata.' : 'Nessuno ha prenotato questa lezione.'}
              </EmptyState>
            ) : (
              filteredBookings.map((booking) => {
                const student = studentMap.get(booking.studentId)
                const bookingCanceled = isCanceledBooking(booking.status)
                const locked = bookingCanceled || lessonCanceled
                const isSaving = Boolean(presenceSaving[booking.id])
                return (
                  <div key={booking.id} className={cn('space-y-3 rounded-lg border bg-card p-4', bookingCanceled && 'opacity-70')}>
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        {student ? (
                          <Link className='inline-flex items-center gap-1 font-medium text-[var(--primary-text)] hover:underline' href={withFrom(`/admin/students/${student.id}`, here)}>
                            {studentLabel(student)}
                          </Link>
                        ) : (
                          <span className='text-muted-foreground'>Caricamento...</span>
                        )}
                        {studentClassLabel(student) && <div className='text-sm text-muted-foreground'>{studentClassLabel(student)}</div>}
                      </div>
                      <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
                        {bookingCanceled && <Badge variant='outline'>{formatBookingStatus(booking.status)}</Badge>}
                        <Badge variant={countsBadgeVariant(booking.countsForStudent)}>Ora: {countsBadgeLabel(booking.countsForStudent).toLowerCase()}</Badge>
                        {student?.email && (
                          <Button asChild size='sm' variant='outline'>
                            <a href={`mailto:${student.email}`}><Mail className='h-4 w-4' /> Scrivi</a>
                          </Button>
                        )}
                        <DropdownMenu
                          open={selectedBooking?.id === booking.id}
                          onOpenChange={(open) => setSelectedBooking(open ? booking : null)}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button variant='ghost' size='icon' className='h-8 w-8' aria-label='Altre azioni'>
                              <MoreHorizontal className='h-4 w-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            <DropdownMenuItem onSelect={() => handleOpenTopicDialog(booking)}>Modifica argomento</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleOpenCountsDialog(booking)}>Modifica conteggio ora</DropdownMenuItem>
                            {!locked && (
                              <DropdownMenuItem className='text-destructive' onSelect={() => handleOpenCancelDialog(booking)}>
                                Annulla prenotazione
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {(booking.topic || !locked) && (
                      // The topic stretches down to the presence buttons, its text staying at the top.
                      <div className='flex flex-col gap-4 sm:flex-row sm:items-stretch'>
                        <div className='flex min-w-0 flex-1 flex-col'>
                          {booking.topic && <p className='flex-1 rounded-md bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap'>{booking.topic}</p>}
                        </div>
                        {!locked && (
                          <PresenceButtons
                            value={booking.studentPresence}
                            disabled={isSaving}
                            onPresent={() => presence.ask({ studentName: studentLabel(student) ?? 'lo studente', present: booking.studentPresence === true ? null : true, run: () => handlePresenceSave(booking, booking.studentPresence === true ? null : true) })}
                            onAbsent={() => presence.ask({ studentName: studentLabel(student) ?? 'lo studente', present: booking.studentPresence === false ? null : false, run: () => handlePresenceSave(booking, booking.studentPresence === false ? null : false) })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </section>
        </div>
      </div>

      {presence.dialog}

      <AlertDialog
        open={bookStudentOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBookStudentOpen(false)
            setSelectedStudentId('')
            setBookingTopic('')
            setStudentSearch('')
          } else {
            setBookStudentOpen(true)
          }
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Prenota per conto studente</AlertDialogTitle>
            <AlertDialogDescription>
              Seleziona uno studente e inserisci l&apos;argomento della lezione.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <FieldLabel htmlFor='student-search'>Cerca studente</FieldLabel>
              <Input
                id='student-search'
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder='Nome, classe o email'
              />
            </div>
            <div className='space-y-2'>
              <FieldLabel htmlFor='student-select'>Studente</FieldLabel>
              <Select
                value={selectedStudentId}
                onValueChange={setSelectedStudentId}
              >
                <SelectTrigger id='student-select' className='w-full'>
                  <SelectValue
                    placeholder={
                      studentsLoading ? 'Caricamento studenti...' : 'Seleziona'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredStudents.length ? (
                    filteredStudents.map((student) => {
                      const label = studentLabel(student) ?? student.id
                      const klass = studentClassLabel(student)
                      const detail = klass ? ` • ${klass}` : ''
                      return (
                        <SelectItem key={student.id} value={student.id}>
                          {`${label}${detail}`}
                        </SelectItem>
                      )
                    })
                  ) : (
                    <SelectItem value='__empty' disabled>
                      Nessuno studente trovato
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {!lesson?.subjectId && bookingSubjectOptions.length > 0 ? (
              <div className='space-y-2'>
                <FieldLabel htmlFor='booking-subject'>Materia</FieldLabel>
                <Select
                  value={bookingSubjectId || '__none__'}
                  onValueChange={(value) =>
                    setBookingSubjectId(value === '__none__' ? '' : value)
                  }
                >
                  <SelectTrigger id='booking-subject' className='w-full'>
                    <SelectValue placeholder='Seleziona materia' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>Seleziona materia</SelectItem>
                    {bookingSubjectOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-xs text-muted-foreground'>
                  La lezione non ha ancora una materia: la sceglie questa
                  prenotazione.
                </p>
              </div>
            ) : null}
            <div className='space-y-2'>
              <FieldLabel htmlFor='booking-topic'>Argomento</FieldLabel>
              <Input
                id='booking-topic'
                value={bookingTopic}
                onChange={(event) => setBookingTopic(capitalizeFirst(event.target.value))}
                placeholder="Inserisci l'argomento"
              />
            </div>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCreateBooking()
              }}
              disabled={
                isCreatingBooking ||
                !selectedStudentId ||
                (!lesson?.subjectId && !bookingSubjectId)
              }
            >
              {isCreatingBooking ? 'Salvataggio...' : 'Prenota'}
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
            <AlertDialogTitle>Modifica argomento</AlertDialogTitle>
            <AlertDialogDescription>
              Aggiorna l&apos;argomento della prenotazione selezionata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-2'>
            <Input
              value={topicValue}
              onChange={(event) => setTopicValue(capitalizeFirst(event.target.value))}
              placeholder="Inserisci l'argomento"
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
          {cancelTarget && (
            <div className='rounded-md border p-3 text-sm text-muted-foreground space-y-1'>
              <div>
                Studente:{' '}
                {studentMap.get(cancelTarget.studentId)
                  ? studentLabel(studentMap.get(cancelTarget.studentId)!)
                  : 'Caricamento...'}
              </div>
              <div>
                Lezione:{' '}
                {lesson ? formatItalianDate(lesson.startAt) : 'Caricamento...'}
              </div>
              <div>Tutor: {tutorLabel(tutor) ?? '-'}</div>
              <div>Materia: {subjectLabel}</div>
              <div>Argomento: {cancelTarget.topic || '-'}</div>
              <div>Stato: {formatBookingStatus(cancelTarget.status)}</div>
            </div>
          )}
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
        open={cancelLessonOpen}
        onOpenChange={(open) => {
          setCancelLessonOpen(open)
        }}
      >
        <AlertDialogContent className='max-w-[calc(100%-3rem)] max-h-[calc(100vh-3rem)] overflow-y-auto sm:max-w-lg'>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla lezione</AlertDialogTitle>
            <AlertDialogDescription>
              Confermi l&apos;annullamento della lezione selezionata?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {lesson && (
            <div className='rounded-md border p-3 text-sm text-muted-foreground space-y-1'>
              <div>Data: {formatItalianDate(lesson.startAt)}</div>
              <div>Tutor: {tutorLabel(tutor) ?? '-'}</div>
              <div>Materia: {subjectLabel}</div>
              <div>
                Posti occupati: {lessonOccupiedSeats(lesson)}/
                {lesson.lessonCapacity}
              </div>
            </div>
          )}
          <div className='flex items-center gap-3'>
            <Checkbox
              id='cancel-lesson-counts-tutor'
              checked={cancelLessonCountsForTutor}
              onCheckedChange={(value) =>
                setCancelLessonCountsForTutor(Boolean(value))
              }
            />
            <Label htmlFor='cancel-lesson-counts-tutor'>
              Conteggia per il tutor
            </Label>
          </div>
          <AlertDialogFooter className='pt-2 sm:pt-0'>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleCancelLesson()
              }}
              disabled={isCancellingLesson}
            >
              {isCancellingLesson ? 'Annullamento...' : 'Conferma'}
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
                        rescheduleTutorSubjectsLoading || rescheduleSubjectsLoading
                          ? 'Caricamento...'
                          : 'Seleziona materia'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>Seleziona materia</SelectItem>
                    {lesson?.subjectFromBooking ? (
                      <SelectItem value={OPEN_SUBJECT_VALUE}>
                        Nessuna: la sceglie la prima prenotazione
                      </SelectItem>
                    ) : null}
                    {rescheduleSubjectSplit.preferred.length > 0 ? (
                      <SelectItem value='__preferred__' disabled>
                        Materie del tutor
                      </SelectItem>
                    ) : null}
                    {rescheduleSubjectSplit.preferred.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                    {rescheduleSubjectSplit.preferred.length > 0 &&
                    rescheduleSubjectSplit.others.length > 0 ? (
                      <SelectSeparator />
                    ) : null}
                    {rescheduleSubjectSplit.preferred.length > 0 &&
                    rescheduleSubjectSplit.others.length > 0 ? (
                      <SelectItem value='__others__' disabled>
                        Altre materie
                      </SelectItem>
                    ) : null}
                    {rescheduleSubjectSplit.others.map((subject) => (
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
