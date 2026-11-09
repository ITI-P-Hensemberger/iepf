'use client'

// Purpose: Dialog to book a lesson on behalf of a student.
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type SubjectOption } from '@/lib/lesson-subject'
import { capitalizeFirst } from '@/lib/capitalize'
import type { BookStudent } from './use-book-student'
import type { Lesson } from './shared'
import { studentLabel, studentClassLabel } from './shared'

export function BookStudentDialog({ booking, lesson, bookingSubjectOptions }: { booking: BookStudent; lesson: Lesson | null; bookingSubjectOptions: SubjectOption[] }) {
  const { bookStudentOpen, setBookStudentOpen, studentsLoading, studentSearch, setStudentSearch, selectedStudentId, setSelectedStudentId, bookingTopic, setBookingTopic, bookingSubjectId, setBookingSubjectId, isCreatingBooking, filteredStudents, handleCreateBooking } = booking

  return (
    <>
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
                  handleCreateBooking()
                }}
                disabled={
                  isCreatingBooking ||
                  !selectedStudentId ||
                  // The backend needs a topic, as when students book themselves.
                  !bookingTopic.trim() ||
                  (!lesson?.subjectId && !bookingSubjectId)
                }
              >
                {isCreatingBooking ? 'Salvataggio...' : 'Prenota'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </>
  )
}
