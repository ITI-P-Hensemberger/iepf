'use client'

// Purpose: Dialogs to move a lesson to another tutor, subject, date or time.
import { CalendarIcon } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DatePicker, useSchoolDays } from '@/components/date-picker'
import { Field } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import type { RescheduleLesson } from './use-reschedule-lesson'
import type { Lesson } from './shared'
import { AVAILABLE_TIMES, OPEN_SUBJECT_VALUE, tutorLabel } from './shared'

export function RescheduleLessonDialog({ reschedule, lesson }: { reschedule: RescheduleLesson; lesson: Lesson | null }) {
  const { isRescheduleOpen, setIsRescheduleOpen, rescheduleForm, setRescheduleForm, isRescheduling, rescheduleTutorsLoading, rescheduleSubjectsLoading, rescheduleTutorSubjectsLoading, sortedRescheduleTutors, rescheduleSubjectSplit, handleReschedule } = reschedule
  const schoolDays = useSchoolDays()

  return (
    <>
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
                <>
                  <Field className='gap-2'>
                    <Label htmlFor='reschedule-date'>Data</Label>
                    <DatePicker
                      id='reschedule-date'
                      value={rescheduleForm.date}
                      onChange={(date) => setRescheduleForm((prev) => ({ ...prev, date }))}
                      disabled={schoolDays.disabled}
                      modifiers={schoolDays.modifiers}
                    />
                  </Field>
                  <Field className='gap-2'>
                    <Label htmlFor='reschedule-time'>Orario</Label>
                    <Select
                      value={rescheduleForm.time}
                      onValueChange={(value) => setRescheduleForm((prev) => ({ ...prev, time: value }))}
                    >
                      <SelectTrigger id='reschedule-time' className='w-full'>
                        <SelectValue placeholder='Scegli l’orario' />
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
                </>
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

    </>
  )
}
