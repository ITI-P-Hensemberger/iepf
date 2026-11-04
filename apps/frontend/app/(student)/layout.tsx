import { type ReactNode } from 'react'

import StudentGuard from '@/components/student-guard'

type StudentLayoutProps = {
  children: ReactNode
}

export default function StudentLayout({ children }: StudentLayoutProps) {
  return <StudentGuard>{children}</StudentGuard>
}
