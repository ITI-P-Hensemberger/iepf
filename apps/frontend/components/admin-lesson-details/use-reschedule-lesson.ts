// Purpose: State and actions of the reschedule dialog on the admin lesson details page.
import * as React from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import { extractPayloadArray } from '@/lib/backend-response'
import type { Lesson, Tutor, Subject } from './shared'
import { AVAILABLE_TIMES, OPEN_SUBJECT_VALUE, normalizePaged, timeFromDate, combineDateAndTime } from './shared'

const TUTORS_QUERY = 'role=tutor&limit=200&offset=0'
const noTutors: Tutor[] = []
const noSubjects: Subject[] = []
const noSubjectIds: string[] = []

export function useRescheduleLesson({ lesson, reloadLessons }: { lesson: Lesson | null, reloadLessons: () => Promise<void> }) {
  const [isRescheduleOpen, setIsRescheduleOpen] = React.useState(false)
  const [rescheduleForm, setRescheduleForm] = React.useState({
    tutorId: '',
    subjectId: '',
    date: undefined as Date | undefined,
    time: '15:00'
  })
  // The lists load when the dialog opens; the tutor's subjects when a tutor is picked.
  // Lists only help choosing: if they fail the dialog stays usable, so no toast.
  const tutorsResult = useQuery({
    queryKey: ['users', TUTORS_QUERY],
    queryFn: async () => normalizePaged<Tutor>(await apiFetch(`/api/users?${TUTORS_QUERY}`, 'Impossibile caricare i tutor.')).items,
    enabled: isRescheduleOpen,
    meta: { inline: true }
  })
  const subjectsResult = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => extractPayloadArray<Subject>(await apiFetch('/api/subjects', 'Impossibile caricare le materie.')),
    enabled: isRescheduleOpen,
    meta: { inline: true }
  })
  const tutorSubjectsResult = useQuery({
    queryKey: ['users', rescheduleForm.tutorId, 'subjects'],
    queryFn: async () => extractPayloadArray<Subject>(await apiFetch(`/api/tutors/${rescheduleForm.tutorId}/subjects`, 'Impossibile caricare le materie.'))
      .map((subject) => subject.id),
    enabled: isRescheduleOpen && Boolean(rescheduleForm.tutorId),
    meta: { inline: true }
  })
  const rescheduleTutors = tutorsResult.data ?? noTutors
  const rescheduleSubjects = subjectsResult.data ?? noSubjects
  const rescheduleTutorsLoading = tutorsResult.isFetching
  const rescheduleSubjectsLoading = subjectsResult.isFetching
  const rescheduleTutorSubjectsLoading = tutorSubjectsResult.isFetching
  const tutorSubjectIds = isRescheduleOpen && rescheduleForm.tutorId ? (tutorSubjectsResult.data ?? noSubjectIds) : noSubjectIds
  const rescheduleTutorSubjectIds = React.useMemo(() => new Set(tutorSubjectIds), [tutorSubjectIds])

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
    setIsRescheduleOpen(true)
  }, [lesson])

  const rescheduleLesson = useMutation({
    mutationFn: (body: { id: string, tutorId: string, subjectId: string | null, startAt: string }) => apiFetch(
      `/api/lessons/${body.id}/reschedule`,
      'Impossibile riprogrammare la lezione.',
      jsonBody('POST', { tutorId: body.tutorId, subjectId: body.subjectId, startAt: body.startAt, durationMinutes: 60 })
    ),
    // The lesson keeps its id: reloading shows it moved, with its bookings and history.
    onSuccess: async () => {
      toast.success('Lezione riprogrammata.')
      setIsRescheduleOpen(false)
      await reloadLessons()
    }
  })
  const isRescheduling = rescheduleLesson.isPending

  const handleReschedule = () => {
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
    rescheduleLesson.mutate({
      id: lesson.id,
      tutorId: rescheduleForm.tutorId,
      subjectId: rescheduleForm.subjectId === OPEN_SUBJECT_VALUE ? null : rescheduleForm.subjectId,
      startAt: combineDateAndTime(rescheduleForm.date, timeValue).toISOString()
    })
  }

  return {
    isRescheduleOpen,
    setIsRescheduleOpen,
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
