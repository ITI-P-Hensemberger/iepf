import { type ReactNode } from 'react'

import ActivatorGuard from '@/components/activator-guard'

type ActivatorLayoutProps = {
  children: ReactNode
}

export default function ActivatorLayout({ children }: ActivatorLayoutProps) {
  return <ActivatorGuard>{children}</ActivatorGuard>
}
