'use client'
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { BellOff } from 'lucide-react'

import { NotificationBell } from '@/components/notification-bell'
import { UsageTracker } from '@/components/usage-tracker'
import { isPushRole, openPushSetup, usePushSetup } from '@/components/push-prompt'
import { logout } from '@/lib/auth-client'
import { useSession } from '@/lib/use-session'
import { Avatar, AvatarFallback } from './ui/avatar'
import { avatarGradient } from '@/lib/avatar'
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

function MenuLink({
  href,
  children
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <DropdownMenuItem asChild className='cursor-pointer'>
      {/* Prefetching would call the proxy and the backend for every visible item. */}
      <Link href={href} prefetch={false}>
        {children}
      </Link>
    </DropdownMenuItem>
  )
}

export default function Header() {
  const { profile } = useSession()
  // Not null while this device could still turn push on: the popup is one click away.
  const pushSetup = usePushSetup(profile?.role)
  const gradient = avatarGradient(profile?.email)

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
        <div className='flex items-center gap-2'>
        <UsageTracker signedIn={Boolean(profile)} />
        {/* Activators get no notifications, so they have no panel either. */}
        {isPushRole(profile?.role) && <NotificationBell />}
        <DropdownMenu>
          <DropdownMenuTrigger className='focus:outline-none'>
            <Avatar
              className='flex justify-center items-center rounded-full text-white'
              style={{
                backgroundImage: gradient,
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
            {pushSetup && (
              <DropdownMenuItem
                className='cursor-pointer text-amber-700 dark:text-amber-400'
                onSelect={() => openPushSetup()}
              >
                <BellOff className='size-4' />
                Notifiche spente
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {profile?.role === 'student' && (
              <MenuLink href='/faq'>Domande frequenti</MenuLink>
            )}
            {profile?.role === 'tutor' && (
              <DropdownMenuGroup>
                <MenuLink href='/tutor/settings/availability'>
                  Disponibilità
                </MenuLink>
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
                <MenuLink href='/admin/announcements'>Popup</MenuLink>
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
      </div>
    </header>
  )
}
