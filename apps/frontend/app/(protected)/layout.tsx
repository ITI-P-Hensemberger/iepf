import { type ReactNode } from 'react'

type ProtectedLayoutProps = {
  children: ReactNode
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return <>{children}</>
}
