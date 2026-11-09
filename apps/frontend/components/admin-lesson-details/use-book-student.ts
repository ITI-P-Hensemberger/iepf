// Purpose: State and actions of the dialog that books a student on the admin lesson details page.
import * as React from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch, jsonBody } from '@/lib/api-fetch'
import type { Student } from './shared'
import { normalizePaged, studentLabel, studentClassLabel } from './shared'

const STUDENTS_QUERY = 'role=student&limit=200&offset=0'
const noStudents: Student[] = []

export function useBookStudent({ lessonId, reloadLessons }: { lessonId: string, reloadLessons: () => Promise<void> }) {
  const [bookStudentOpen, setBookStudentOpen] = React.useState(false)
  // Loaded the first time the dialog opens.
  const { data: students = noStudents, isFetching: studentsLoading } = useQuery({
    queryKey: ['users', STUDENTS_QUERY],
    queryFn: async () => normalizePaged<Student>(await apiFetch(`/api/users?${STUDENTS_QUERY}`, 'Impossibile caricare gli studenti.')).items,
    enabled: bookStudentOpen
  })
  const [studentSearch, setStudentSearch] = React.useState('')
  const [selectedStudentId, setSelectedStudentId] = React.useState('')
  const [bookingTopic, setBookingTopic] = React.useState('')
  const [bookingSubjectId, setBookingSubjectId] = React.useState('')

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

  const createBooking = useMutation({
    mutationFn: () => apiFetch(`/api/lessons/${lessonId}/book`, 'Impossibile creare la prenotazione.', jsonBody('POST', {
      studentId: selectedStudentId,
      topic: bookingTopic.trim(),
      subjectId: bookingSubjectId || undefined
    })),
    onSuccess: () => {
      toast.success('Prenotazione creata.')
      setBookStudentOpen(false)
      setSelectedStudentId('')
      setBookingTopic('')
      setBookingSubjectId('')
      setStudentSearch('')
      return reloadLessons()
    }
  })
  const isCreatingBooking = createBooking.isPending
  const handleCreateBooking = () => {
    if (selectedStudentId && bookingTopic.trim()) createBooking.mutate()
  }

  return {
    bookStudentOpen,
    setBookStudentOpen,
    studentsLoading,
    studentSearch,
    setStudentSearch,
    selectedStudentId,
    setSelectedStudentId,
    bookingTopic,
    setBookingTopic,
    bookingSubjectId,
    setBookingSubjectId,
    isCreatingBooking,
    filteredStudents,
    handleCreateBooking
  }
}

export type BookStudent = ReturnType<typeof useBookStudent>
