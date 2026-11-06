// A generated lesson is open until its first booking picks one of the tutor's subjects.
export const OPEN_SUBJECT_LABEL = 'Materia a scelta'

export type SubjectOption = {
  id: string
  name: string
}

// The lesson's subject, or a stand-in named for open lessons no booking has given a subject yet.
export function lessonSubject<T extends SubjectOption>(
  subjectId: string | null | undefined,
  subjects: Map<string, T>
): SubjectOption | undefined {
  if (!subjectId) return { id: '', name: OPEN_SUBJECT_LABEL }
  return subjects.get(subjectId)
}

// The subject a booking starts with: the lesson's own, the one the student is looking for,
// or the only one on offer. Empty when the student still has to choose.
export function initialBookingSubject(
  lesson: { subjectId: string | null, subjectOptions: SubjectOption[] },
  wanted?: string
) {
  if (lesson.subjectId) return lesson.subjectId
  if (wanted && lesson.subjectOptions.some((option) => option.id === wanted)) return wanted
  return lesson.subjectOptions.length === 1 ? lesson.subjectOptions[0].id : ''
}
