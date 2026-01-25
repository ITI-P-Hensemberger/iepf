'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  CalendarIcon,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Save,
  UserPlus
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { toast } from 'sonner'

import { formatItalianDate } from '@/lib/format-date'
import { BackButton } from '@/components/back-button'

const AVAILABLE_TIMES = ['13:00', '14:00', '15:00', '16:00']

type Lesson = {
  id: string
  tutorId: string
  subjectId: string
  startAt: string
  durationMinutes: number
  lessonCapacity: number
  dailyAvailability?: number | null
  dailyOccupancy?: number | null
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

type PresenceOption = 'none' | 'present' | 'absent'

function presenceToOption(value: boolean | null | undefined): PresenceOption {
  if (value === true) return 'present'
  if (value === false) return 'absent'
  return 'none'
}

function optionToPresence(option: PresenceOption): boolean | null {
  if (option === 'present') return true
  if (option === 'absent') return false
  return null
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
  const availability = parseNumeric(lesson.dailyAvailability)
  if (occupancy === null || availability === null) {
    return '-'
  }
  return `${Math.max(0, occupancy)}/${availability}`
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
  const [lessonLoading, setLessonLoading] = React.useState(true)

  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = React.useState(true)
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

  const [selectedBooking, setSelectedBooking] = React.useState<Booking | null>(
    null
  )
  const [presenceDrafts, setPresenceDrafts] = React.useState<
    Record<string, boolean | null>
  >({})
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

  const [bookStudentOpen, setBookStudentOpen] = React.useState(false)
  const [studentsLoading, setStudentsLoading] = React.useState(false)
  const [students, setStudents] = React.useState<Student[]>([])
  const [studentSearch, setStudentSearch] = React.useState('')
  const [selectedStudentId, setSelectedStudentId] = React.useState('')
  const [bookingTopic, setBookingTopic] = React.useState('')
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
        setPresenceDrafts((prev) => {
          const next = { ...prev }
          delete next[booking.id]
          return next
        })
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
          topic: bookingTopic.trim() ? bookingTopic.trim() : undefined
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
  }, [bookingTopic, lessonId, loadBookings, loadLesson, selectedStudentId])

  const handleTopicUpdate = React.useCallback(async () => {
    if (!topicTarget) {
      return
    }

    const nextTopic = topicValue.trim()
    if (!nextTopic) {
      toast.error('Inserisci un topic valido.')
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
        let message = 'Impossibile aggiornare il topic.'
        try {
          const payload = await response.json()
          message = extractErrorMessage(payload, message)
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      toast.success('Topic aggiornato.')
      setTopicTarget(null)
      setTopicValue('')
      await loadBookings()
      await loadLesson()
    } catch (err) {
      toast.error(
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
      subjectId: lesson.subjectId,
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

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <div className='w-full max-w-6xl space-y-6'>
          <div className='mb-6 self-start'>
            <BackButton />
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-2xl'>Dettagli lezione</h1>
              <p className='text-sm text-muted-foreground'>
                Gestisci prenotazioni e presenze.
              </p>
            </div>
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
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={() => {
                      setCancelLessonCountsForTutor(
                        Boolean(lesson?.countsForTutor)
                      )
                      setCancelLessonOpen(true)
                    }}
                    disabled={!lesson || isCanceledStatus(lesson?.status)}
                  >
                    Annulla lezione
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
                      {tutorLoading ? (
                        'Caricamento...'
                      ) : tutor ? (
                        <Link
                          className='inline-flex items-center gap-1 text-primary hover:underline'
                          href={`/admin/tutors/${tutor.id}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          title='Apri il profilo tutor in una nuova scheda'
                        >
                          <span>{tutorLabel(tutor) ?? '-'}</span>
                          <ExternalLink className='h-4 w-4 shrink-0' />
                          <span className='sr-only'>Apri in nuova scheda</span>
                        </Link>
                      ) : (
                        '-'
                      )}
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
                    <p className='text-sm'>{lessonDailySeatsLabel(lesson)}</p>
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
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <CardTitle>Prenotazioni</CardTitle>
                  <span className='text-sm text-muted-foreground'>
                    {bookingsLoading
                      ? 'Caricamento prenotazioni...'
                      : `Totale ${bookings.length} prenotazioni`}
                  </span>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setBookStudentOpen(true)}
                    disabled={!lesson}
                    className='w-full sm:w-auto'
                  >
                    <UserPlus className='mr-2 h-4 w-4' />
                    Prenota per studente
                  </Button>
                  <Button
                    asChild
                    variant='outline'
                    size='sm'
                    disabled={!lesson}
                    className='w-full sm:w-auto'
                  >
                    <Link href={`/admin/feedback?feedbackLesson=${lesson?.id}`}>
                      <MessageSquare className='mr-2 h-4 w-4' />
                      Feedback
                    </Link>
                  </Button>
                </div>
              </div>
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
                      <TableHead className='w-[35%]'>Studente</TableHead>
                      <TableHead className='w-[45%]'>Topic</TableHead>
                      <TableHead className='w-40'>Presenza</TableHead>
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
                        const draftValue = presenceDrafts[booking.id]
                        const effectiveValue =
                          draftValue !== undefined
                            ? draftValue
                            : booking.studentPresence
                        const isDirty =
                          draftValue !== undefined &&
                          draftValue !== booking.studentPresence
                        const isSaving = Boolean(presenceSaving[booking.id])
                        return (
                          <TableRow key={booking.id}>
                            <TableCell className='w-[35%]'>
                              {student ? (
                                <div className='flex flex-col'>
                                  <Link
                                    className='inline-flex items-center gap-1 text-primary hover:underline'
                                    href={`/admin/students/${student.id}`}
                                    target='_blank'
                                    rel='noopener noreferrer'
                                    title='Apri il profilo studente in una nuova scheda'
                                  >
                                    <span className='whitespace-nowrap'>
                                      {studentLabel(student)}
                                    </span>
                                    <ExternalLink className='h-4 w-4 shrink-0' />
                                    <span className='sr-only'>
                                      Apri in nuova scheda
                                    </span>
                                  </Link>
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
                            <TableCell className='w-[45%] max-w-[24rem] truncate'>
                              {booking.topic}
                            </TableCell>
                            <TableCell className='w-40'>
                              <div className='flex items-center gap-2'>
                                <Select
                                  value={presenceToOption(effectiveValue)}
                                  onValueChange={(value) => {
                                    const nextValue = optionToPresence(
                                      value as PresenceOption
                                    )
                                    setPresenceDrafts((prev) => {
                                      const next = { ...prev }
                                      if (nextValue === booking.studentPresence) {
                                        delete next[booking.id]
                                      } else {
                                        next[booking.id] = nextValue
                                      }
                                      return next
                                    })
                                  }}
                                  disabled={
                                    isCanceledBooking(booking.status) ||
                                    isCanceledStatus(lesson?.status)
                                  }
                                >
                                  <SelectTrigger className='w-28'>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value='none'>-</SelectItem>
                                    <SelectItem value='present'>
                                      Presente
                                    </SelectItem>
                                    <SelectItem value='absent'>
                                      Assente
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant='outline'
                                  size='icon'
                                  className='h-8 w-8'
                                  disabled={
                                    isCanceledBooking(booking.status) ||
                                    isCanceledStatus(lesson?.status) ||
                                    isSaving ||
                                    !isDirty
                                  }
                                  onClick={() =>
                                    void handlePresenceSave(
                                      booking,
                                      effectiveValue
                                    )
                                  }
                                >
                                  <Save className='h-4 w-4' />
                                  <span className='sr-only'>Salva</span>
                                </Button>
                              </div>
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
            </CardContent>
          </Card>
        </div>
      </div>

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
              Seleziona uno studente e inserisci il topic della lezione.
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
            <div className='space-y-2'>
              <FieldLabel htmlFor='booking-topic'>Topic</FieldLabel>
              <Input
                id='booking-topic'
                value={bookingTopic}
                onChange={(event) => setBookingTopic(event.target.value)}
                placeholder='Inserisci il topic'
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
              disabled={isCreatingBooking || !selectedStudentId}
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
              <div>Materia: {subject?.name ?? '-'}</div>
              <div>Topic: {cancelTarget.topic || '-'}</div>
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
              <div>Materia: {subject?.name ?? '-'}</div>
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
