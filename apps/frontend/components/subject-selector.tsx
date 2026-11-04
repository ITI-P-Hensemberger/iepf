'use client'

import * as React from 'react'
import { BookOpen, Check, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

import { extractPayloadArray } from '@/lib/backend-response'

type Subject = {
  id: string
  name: string
}

type SubjectSelectorProps = {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  /** If provided, uses these subjects instead of fetching */
  subjects?: Subject[]
}

export function SubjectSelector({
  value,
  onChange,
  disabled = false,
  subjects: providedSubjects
}: SubjectSelectorProps) {
  const [subjects, setSubjects] = React.useState<Subject[]>(
    providedSubjects || []
  )
  const [isLoading, setIsLoading] = React.useState(!providedSubjects)
  const [searchQuery, setSearchQuery] = React.useState('')

  React.useEffect(() => {
    // If subjects are provided as props, don't fetch
    if (providedSubjects) {
      setSubjects(providedSubjects)
      setIsLoading(false)
      return
    }

    let isMounted = true

    async function loadSubjects() {
      setIsLoading(true)

      try {
        const response = await fetch('/api/subjects')
        if (!response.ok) {
          throw new Error('Impossibile caricare le materie.')
        }
        const payload = await response.json()
        const data = extractPayloadArray<Subject>(payload)
        if (isMounted) {
          setSubjects(data)
        }
      } catch (err) {
        if (isMounted) {
          toast.error(
            err instanceof Error
              ? err.message
              : 'Impossibile caricare le materie.'
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadSubjects()

    return () => {
      isMounted = false
    }
  }, [providedSubjects])

  const filteredSubjects = React.useMemo(() => {
    if (!searchQuery.trim()) return subjects
    const query = searchQuery.toLowerCase()
    return subjects.filter((subject) =>
      subject.name.toLowerCase().includes(query)
    )
  }, [subjects, searchQuery])

  const selectedCount = value.length

  const handleToggle = (subjectId: string) => {
    if (disabled) return

    if (value.includes(subjectId)) {
      onChange(value.filter((id) => id !== subjectId))
    } else {
      onChange([...value, subjectId])
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <BookOpen className='h-5 w-5 text-primary' />
          <h3 className='text-base font-medium'>Materie</h3>
        </div>
        {selectedCount > 0 && (
          <Badge variant='secondary' className='gap-1'>
            {selectedCount}{' '}
            {selectedCount === 1 ? 'materia selezionata' : 'materie selezionate'}
          </Badge>
        )}
      </div>

      <p className='text-sm text-muted-foreground'>
        Seleziona le materie che insegni
      </p>

      {isLoading && (
        <div className='space-y-3'>
          <Skeleton className='h-10 w-full' />
          <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-8 w-full' />
            ))}
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          {subjects.length > 6 && (
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                type='text'
                placeholder='Cerca materie...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={disabled}
                className='pl-9'
              />
            </div>
          )}

          {filteredSubjects.length === 0 ? (
            <div className='rounded-md border border-dashed p-8 text-center'>
              <p className='text-sm text-muted-foreground'>
                {searchQuery
                  ? 'Nessuna materia trovata'
                  : 'Nessuna materia disponibile'}
              </p>
            </div>
          ) : (
            <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
              {filteredSubjects.map((subject) => {
                const isSelected = value.includes(subject.id)
                return (
                  <button
                    key={subject.id}
                    type='button'
                    onClick={() => handleToggle(subject.id)}
                    disabled={disabled}
                    className={`
                      flex items-center gap-2 rounded-lg border p-3 text-left transition-all
                      ${isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50 hover:bg-accent/50'
                      }
                      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <span className={`text-sm break-words leading-tight flex-1 min-w-0 ${isSelected ? 'text-primary font-medium' : ''}`}>
                      {subject.name}
                    </span>
                    {isSelected && (
                      <div className='flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground flex-shrink-0'>
                        <Check className='h-2.5 w-2.5' />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
