// Purpose: State and actions of the dialog that books a student on the admin lesson details page.
import * as React from 'react'
import { toast } from 'sonner'
import type { Student } from './shared'
import { normalizePaged, studentLabel, studentClassLabel, extractErrorMessage } from './shared'

export function useBookStudent({ lessonId, loadLesson, loadBookings }: { lessonId: string, loadLesson: () => Promise<void>, loadBookings: () => Promise<void> }) {
  const [bookStudentOpen, setBookStudentOpen] = React.useState(false)
  const [studentsLoading, setStudentsLoading] = React.useState(false)
  const [students, setStudents] = React.useState<Student[]>([])
  const [studentSearch, setStudentSearch] = React.useState('')
  const [selectedStudentId, setSelectedStudentId] = React.useState('')
  const [bookingTopic, setBookingTopic] = React.useState('')
  const [bookingSubjectId, setBookingSubjectId] = React.useState('')
  const [isCreatingBooking, setIsCreatingBooking] = React.useState(false)

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
    if (!bookStudentOpen || students.length > 0) {
      return
    }
    void loadStudents()
  }, [bookStudentOpen, loadStudents, students.length])

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
