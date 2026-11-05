'use client'
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { logout } from '@/lib/auth-client'
import { useSession } from '@/lib/use-session'
import { Avatar, AvatarFallback } from './ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { ModeToggle } from './theme-mode-toggle'
import { Button } from './ui/button'

function MenuLink({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <DropdownMenuItem asChild className='cursor-pointer'>
      {/* Prefetching would call the proxy and the backend for every visible item. */}
      <Link href={href} prefetch={false}>{children}</Link>
    </DropdownMenuItem>
  )
}

export default function Header() {
  const { profile } = useSession()
  const [avatarGradient, setAvatarGradient] = React.useState(
    'linear-gradient(135deg, #0f172a, #64748b)'
  )

  React.useEffect(() => {
    const gradients = [
      'linear-gradient(135deg, #0f766e, #14b8a6)',
      'linear-gradient(135deg, #1d4ed8, #38bdf8)',
      'linear-gradient(135deg, #c2410c, #f97316)',
      'linear-gradient(135deg, #7e22ce, #f472b6)',
      'linear-gradient(135deg, #047857, #22c55e)',
      'linear-gradient(135deg, #0f172a, #64748b)'
    ]
    const pick = gradients[Math.floor(Math.random() * gradients.length)]
    setAvatarGradient(pick)
  }, [])

  const initials = profile
    ? `${profile?.firstName?.charAt(0)?.toUpperCase() ?? ''}${
        profile?.lastName?.charAt(0)?.toUpperCase() ?? ''
      }`
    : ''

  async function handleLogout() {
    await logout()
  }

  return (
    <header
      className='sticky z-40 border-b bg-background/95 backdrop-blur'
      style={{ top: 'var(--impersonation-banner-height, 0px)' }}
    >
      <div className='container mx-auto flex h-14 items-center justify-between px-4'>
        <Link href='/' className='flex items-center gap-3'>
          <Image
            src='/icon.png'
            alt='IEPF Logo'
            width={26}
            height={26}
            style={{ width: 'auto', height: 'auto' }}
            draggable={false}
            priority
          />
          <span className='text-sm font-medium'>IEPF</span>
          <span className='text-sm font-medium ml-4 text-white/75 hover:text-white hover:underline'>
            Home
          </span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className='focus:outline-none'>
            <Avatar
              className='flex justify-center items-center rounded-full text-white'
              style={{
                backgroundImage: avatarGradient,
                backgroundSize: 'cover',
                backgroundRepeat: 'no-repeat'
              }}
            >
              <AvatarFallback className='bg-transparent'>
                {initials || '...'}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-auto' align='end'>
            <MenuLink href='/profile'>Profilo</MenuLink>
            <DropdownMenuSeparator />
            {profile?.role === 'student' && (
              <MenuLink href='/faq'>Domande frequenti</MenuLink>
            )}
            {profile?.role === 'tutor' && (
              <DropdownMenuGroup>
                <MenuLink href='/tutor/settings/availability'>Disponibilità</MenuLink>
                <MenuLink href='/tutor/settings/subjects'>Materie</MenuLink>
              </DropdownMenuGroup>
            )}
            {profile?.role === 'admin' && (
              <DropdownMenuGroup>
                <MenuLink href='/admin/students'>Gestione Studenti</MenuLink>
                <MenuLink href='/admin/tutors'>Gestione Tutor</MenuLink>
                <MenuLink href='/admin/admins'>Gestione Admin</MenuLink>
                <DropdownMenuSeparator />
                <MenuLink href='/admin/lessons'>Gestione Lezioni</MenuLink>
                <MenuLink href='/admin/feedback'>Gestione Feedback</MenuLink>
                <DropdownMenuSeparator />
                <MenuLink href='/admin/settings'>Impostazioni globali</MenuLink>
                <MenuLink href='/admin/stats'>Statistiche</MenuLink>
              </DropdownMenuGroup>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className='text-muted-foreground'>
              Tema
            </DropdownMenuLabel>
            <DropdownMenuItem className='mb-2'>
              <ModeToggle />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Button
                variant='destructive'
                onClick={handleLogout}
                className='w-full'
              >
                Esci
              </Button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
