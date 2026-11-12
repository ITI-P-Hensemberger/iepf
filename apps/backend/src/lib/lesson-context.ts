// Purpose: The few lesson and student details an admin notice needs.
import db from '@/db'
import { classLabel } from '@/lib/class-label'

export async function lessonContext(lessonId: string, studentId: string) {
  const lesson = await db.query.lessons.findFirst({
    where: (fields, operators) => operators.eq(fields.id, lessonId),
    columns: {
      id: true,
      startAt: true,
      tutorId: true,
      subjectId: true
    }
  })
  if (!lesson) {
    return null
  }
  // The student's booking names the subject even when the lesson's own subject has opened again.
  const booking = await db.query.lessonBookings.findFirst({
    where: (fields, operators) => operators.and(operators.eq(fields.lessonId, lessonId), operators.eq(fields.studentId, studentId)),
    orderBy: (fields, operators) => operators.desc(fields.createdAt),
    columns: { subjectId: true }
  })
  const subjectId = booking?.subjectId ?? lesson.subjectId
  if (!subjectId) {
    return null
  }
  const [subject, tutor, student, profile] = await Promise.all([
    db.query.subjects.findFirst({
      where: (fields, operators) => operators.eq(fields.id, subjectId),
      columns: { name: true }
    }),
    db.query.users.findFirst({
      where: (fields, operators) => operators.eq(fields.id, lesson.tutorId),
      columns: { firstName: true, lastName: true }
    }),
    db.query.users.findFirst({
      where: (fields, operators) => operators.eq(fields.id, studentId),
      columns: { firstName: true, lastName: true }
    }),
    db.query.studentProfiles.findFirst({
      where: (fields, operators) => operators.eq(fields.userId, studentId),
      columns: { sectionId: true, year: true }
    })
  ])
  if (!subject || !tutor || !student) {
    return null
  }
  const section = profile?.sectionId
    ? await db.query.classSections.findFirst({
        where: (fields, operators) => operators.eq(fields.id, profile.sectionId!),
        columns: { name: true }
      })
    : undefined
  return {
    lessonId: lesson.id,
    lessonStartAt: new Date(lesson.startAt),
    subjectName: subject.name,
    tutorName: `${tutor.firstName} ${tutor.lastName}`.trim(),
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    studentClass: classLabel(profile?.year ?? null, section?.name ?? null)
  }
}
