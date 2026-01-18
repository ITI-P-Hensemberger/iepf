import Header from '@/components/header'
import { type ReactNode } from 'react'

type AdminLayoutProps = {
  children: ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      {' '}
      <Header />
      {children}
    </>
  )
}
