import { type ReactNode } from 'react'

import TutorGuard from '@/components/tutor-guard'

type TutorLayoutProps = {
  children: ReactNode
}

export default function TutorLayout({ children }: TutorLayoutProps) {
  return <TutorGuard>{children}</TutorGuard>
}
