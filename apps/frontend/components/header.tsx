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
    <header className='sticky top-0 z-40 border-b bg-background/95 backdrop-blur'>
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
            <DropdownMenuItem
              className='cursor-pointer'
              onSelect={(event) => {
                event.preventDefault()
                window.location.assign('/profile')
              }}
            >
              Profilo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {profile?.role === 'student' && (
              <DropdownMenuItem
                className='cursor-pointer'
                onSelect={(event) => {
                  event.preventDefault()
                  window.location.assign('/faq')
                }}
              >
                Domande frequenti
              </DropdownMenuItem>
            )}
            {profile?.role === 'tutor' && (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/tutor/settings/availability')
                  }}
                >
                  Disponibilità
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/tutor/settings/subjects')
                  }}
                >
                  Materie
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}
            {profile?.role === 'admin' && (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/admin/students')
                  }}
                >
                  Gestione Studenti
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/admin/tutors')
                  }}
                >
                  Gestione Tutor
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/admin/admins')
                  }}
                >
                  Gestione Admin
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/admin/lessons')
                  }}
                >
                  Gestione Lezioni
                </DropdownMenuItem>
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/admin/feedback')
                  }}
                >
                  Gestione Feedback
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className='cursor-pointer'
                  onSelect={(event) => {
                    event.preventDefault()
                    window.location.assign('/admin/settings')
                  }}
                >
                  Impostazioni globali
                </DropdownMenuItem>
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
