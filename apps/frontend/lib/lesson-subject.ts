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
