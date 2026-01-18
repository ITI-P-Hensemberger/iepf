'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { logout } from '@/lib/auth-client'
import Link from 'next/link'
import { useSession } from '@/lib/use-session'

type User = {
  id: string
  email: string
  firstName: string
  lastName: string
  role?: string | null
  sectionId?: string | null
  year?: number | null
  isActive?: boolean | null
}

type Section = {
  id: string
  name: string
}

export default function AdminPage() {
  const router = useRouter()
  const { profile, isLoading: isProfileLoading } = useSession()
  const [users, setUsers] = React.useState<User[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [actionId, setActionId] = React.useState<string | null>(null)
  const [sectionMap, setSectionMap] = React.useState<Map<string, string>>(
    () => new Map()
  )

  React.useEffect(() => {
    let isMounted = true

    async function loadSections() {
      try {
        const response = await fetch('/api/class-sections')
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as Section[]
        if (isMounted) {
          setSectionMap(
            new Map(data.map((section) => [section.id, section.name]))
          )
        }
      } catch (err) {
        // Optional: skip showing section names if unavailable.
      }
    }

    async function loadUsers() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/users')
        if (!response.ok) {
          throw new Error('Impossibile caricare gli studenti.')
        }
        const data = (await response.json()) as User[]
        if (isMounted) {
          setUsers(data.filter((user) => user.role === 'student'))
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare gli studenti.'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSections()
    void loadUsers()

    return () => {
      isMounted = false
    }
  }, [])

  const getSectionLabel = (user: User) => {
    if (!user.sectionId) {
      return '-'
    }
    return sectionMap.get(user.sectionId) ?? user.sectionId
  }

  const formatEmail = (email: string) => email.split('@')[0] ?? email

  const sortByLastName = (list: User[]) =>
    [...list].sort((a, b) =>
      a.lastName.localeCompare(b.lastName, 'it', { sensitivity: 'base' })
    )

  const activeStudents = sortByLastName(users.filter((user) => user.isActive))
  const inactiveStudents = sortByLastName(
    users.filter((user) => !user.isActive)
  )

  async function handleLogout() {
    await logout()
    router.replace('/')
  }

  async function handleToggleActive(user: User) {
    setActionId(user.id)
    setError(null)

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !user.isActive })
      })

      if (!response.ok) {
        throw new Error('Impossibile aggiornare lo stato.')
      }

      const updated = (await response.json()) as User
      setUsers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossibile aggiornare lo stato.'
      )
    } finally {
      setActionId(null)
    }
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <h1 className='mt-6 text-2xl'>
          {!isProfileLoading && `Bentornato, ${profile?.firstName}`}
        </h1>
        <p className='mt-6 text-center max-w-md text-muted-foreground'>
          Gestisci gli studenti e lo stato di attivazione.
        </p>
        <div className='mt-8 w-full space-y-10'>
          <section>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>Studenti non attivi</h2>
              <span className='text-sm text-muted-foreground'>
                {inactiveStudents.length}
              </span>
            </div>
            <div className='mt-4 overflow-auto rounded-lg border max-h-105'>
              <table className='min-w-180 w-full text-sm'>
                <thead className='bg-muted/50 text-left'>
                  <tr>
                    <th className='px-4 py-3 font-medium'>Cognome</th>
                    <th className='px-4 py-3 font-medium'>Nome</th>
                    <th className='px-4 py-3 font-medium'>
                      Email{' '}
                      <span className='text-muted-foreground'>@itismonza</span>
                    </th>
                    <th className='px-4 py-3 font-medium'>Classe</th>
                    <th className='px-4 py-3 font-medium'></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td
                        className='px-4 py-4 text-muted-foreground'
                        colSpan={5}
                      >
                        Caricamento...
                      </td>
                    </tr>
                  )}
                  {!isLoading && inactiveStudents.length === 0 && (
                    <tr>
                      <td
                        className='px-4 py-4 text-muted-foreground'
                        colSpan={5}
                      >
                        Nessuno studente in attesa.
                      </td>
                    </tr>
                  )}
                  {inactiveStudents.map((student) => (
                    <tr key={student.id} className='border-t'>
                      <td className='px-4 py-4'>{student.lastName}</td>
                      <td className='px-4 py-4'>{student.firstName}</td>
                      <td className='px-4 py-4'>
                        <Link href={`mailto:${student.email}`}>
                          {formatEmail(student.email)}
                        </Link>
                      </td>
                      <td className='px-4 py-4'>
                        {student.year ?? ''}
                        {getSectionLabel(student)}
                      </td>
                      <td className='px-4 py-4'>
                        <Button
                          size='sm'
                          disabled={actionId === student.id}
                          onClick={() => handleToggleActive(student)}
                        >
                          {actionId === student.id
                            ? 'Aggiornamento...'
                            : 'Attiva'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>Studenti attivi</h2>
              <span className='text-sm text-muted-foreground'>
                {activeStudents.length}
              </span>
            </div>
            <div className='mt-4 overflow-auto rounded-lg border max-h-105'>
              <table className='min-w-180 w-full text-sm'>
                <thead className='bg-muted/50 text-left'>
                  <tr>
                    <th className='px-4 py-3 font-medium'>Cognome</th>
                    <th className='px-4 py-3 font-medium'>Nome</th>
                    <th className='px-4 py-3 font-medium'>
                      Email{' '}
                      <span className='text-muted-foreground'>@itismonza</span>
                    </th>
                    <th className='px-4 py-3 font-medium'>Classe</th>
                    <th className='px-4 py-3 font-medium'></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td
                        className='px-4 py-4 text-muted-foreground'
                        colSpan={5}
                      >
                        Caricamento...
                      </td>
                    </tr>
                  )}
                  {!isLoading && activeStudents.length === 0 && (
                    <tr>
                      <td
                        className='px-4 py-4 text-muted-foreground'
                        colSpan={5}
                      >
                        Nessuno studente attivo.
                      </td>
                    </tr>
                  )}
                  {activeStudents.map((student) => (
                    <tr key={student.id} className='border-t'>
                      <td className='px-4 py-4'>{student.lastName}</td>
                      <td className='px-4 py-4'>{student.firstName}</td>
                      <td className='px-4 py-4'>
                        {formatEmail(student.email)}
                      </td>
                      <td className='px-4 py-4'>
                        {student.year ?? ''}
                        {getSectionLabel(student)}
                      </td>
                      <td className='px-4 py-4'>
                        <Button
                          variant='destructive'
                          size='sm'
                          disabled={actionId === student.id}
                          onClick={() => handleToggleActive(student)}
                        >
                          {actionId === student.id
                            ? 'Aggiornamento...'
                            : 'Disattiva'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {error && <p className='text-sm text-destructive'>{error}</p>}
        </div>
      </div>
    </main>
  )
}
