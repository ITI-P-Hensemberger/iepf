// A generated lesson is open until its first booking picks one of the tutor's subjects.

export type SubjectOption = {
  id: string
  name: string
}

// The lesson's subject; a lesson nobody booked yet has none and shows an empty name.
export function lessonSubject<T extends SubjectOption>(
  subjectId: string | null | undefined,
  subjects: Map<string, T>
): SubjectOption | undefined {
  if (!subjectId) return { id: '', name: '' }
  return subjects.get(subjectId)
}
