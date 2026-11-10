import { type ReactNode } from 'react'

import StudentGuard from '@/components/student-guard'
import { LessonChatProvider } from '@/components/lesson-chat'

type StudentLayoutProps = {
  children: ReactNode
}

export default function StudentLayout({ children }: StudentLayoutProps) {
  return (
    <StudentGuard>
      <LessonChatProvider role='student'>{children}</LessonChatProvider>
    </StudentGuard>
  )
}
