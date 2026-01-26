import { type ReactNode } from 'react'
import ProtectedShell from '@/components/protected-shell'

type ProtectedLayoutProps = {
  children: ReactNode
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return <ProtectedShell>{children}</ProtectedShell>
}
