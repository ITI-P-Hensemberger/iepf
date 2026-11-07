// Purpose: State and actions of the reschedule dialog on the admin lesson details page.
import * as React from 'react'
import { toast } from 'sonner'
import { extractPayloadArray } from '@/lib/backend-response'
import type { Lesson, Tutor, Subject } from './shared'
import { AVAILABLE_TIMES, OPEN_SUBJECT_VALUE, normalizePaged, timeFromDate, combineDateAndTime, extractErrorMessage } from './shared'

export function useRescheduleLesson({ lesson, loadLesson, loadBookings }: { lesson: Lesson | null, loadLesson: () => Promise<void>, loadBookings: () => Promise<void> }) {
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

  return {
    isRescheduleOpen,
    setIsRescheduleOpen,
    isRescheduleDateOpen,
    setIsRescheduleDateOpen,
    rescheduleForm,
    setRescheduleForm,
    isRescheduling,
    rescheduleTutorsLoading,
    rescheduleSubjectsLoading,
    rescheduleTutorSubjectsLoading,
    sortedRescheduleTutors,
    rescheduleSubjectSplit,
    handleOpenReschedule,
    handleReschedule
  }
}

export type RescheduleLesson = ReturnType<typeof useRescheduleLesson>
