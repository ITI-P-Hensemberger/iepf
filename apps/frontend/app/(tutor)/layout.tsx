import { type ReactNode } from 'react'

import TutorGuard from '@/components/tutor-guard'
import { LessonChatProvider } from '@/components/lesson-chat'

type TutorLayoutProps = {
  children: ReactNode
}

export default function TutorLayout({ children }: TutorLayoutProps) {
  return (
    <TutorGuard>
      <LessonChatProvider role='tutor'>{children}</LessonChatProvider>
    </TutorGuard>
  )
}
