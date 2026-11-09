'use client'

import * as React from 'react'
import { BookOpen, Check, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { EmptyState } from '@/components/empty-state'
import { SearchField } from '@/components/search-field'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'

import { apiFetch } from '@/lib/api-fetch'
import { extractPayloadArray } from '@/lib/backend-response'
import { cn } from '@/lib/utils'

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
  // The subjects already saved: the badges on top tell new and removed ones from them.
  saved?: string[]
  // Keeps the search under the header while the list scrolls: for pages where the list is the whole page.
  stickySearch?: boolean
}

const noSubjects: Subject[] = []

export function SubjectSelector({
  value,
  onChange,
  disabled = false,
  subjects: providedSubjects,
  saved,
  stickySearch = false
}: SubjectSelectorProps) {
  // Shares the cache with every other list of subjects; not loaded when they are passed in.
  const subjectsQuery = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => extractPayloadArray<Subject>(await apiFetch('/api/subjects', 'Impossibile caricare le materie.')),
    enabled: !providedSubjects
  })
  const subjects = providedSubjects ?? subjectsQuery.data ?? noSubjects
  const isLoading = !providedSubjects && subjectsQuery.isPending
  const [searchQuery, setSearchQuery] = React.useState('')

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

  const nameOf = new Map(subjects.map((subject) => [subject.id, subject.name]))
  const savedSet = new Set(saved ?? value)
  // Selected ones first (saved, then new), then the saved ones about to be removed.
  const chips = [
    ...value.map((id) => ({ id, state: savedSet.has(id) ? 'saved' as const : 'added' as const })),
    ...(saved ?? []).filter((id) => !value.includes(id)).map((id) => ({ id, state: 'removed' as const }))
  ].filter((chip) => nameOf.has(chip.id))
    .sort((a, b) => (a.state === b.state ? (nameOf.get(a.id) ?? '').localeCompare(nameOf.get(b.id) ?? '', 'it') : 0))

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='space-y-1'>
          <h3 className='flex items-center gap-2 font-semibold'>
            <BookOpen className='size-4 text-muted-foreground' aria-hidden /> Materie
          </h3>
          <p className='text-sm text-muted-foreground'>Spunta le materie che puoi insegnare.</p>
        </div>
        <Badge variant={selectedCount > 0 ? 'secondary' : 'outline'}>
          {selectedCount === 0 ? 'Nessuna materia' : `${selectedCount} ${selectedCount === 1 ? 'materia' : 'materie'}`}
        </Badge>
      </div>

      {chips.length > 0 && (
        <div className='flex flex-wrap gap-1.5' aria-label='Materie scelte'>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type='button'
              disabled={disabled}
              onClick={() => handleToggle(chip.id)}
              title={chip.state === 'removed' ? 'Tienila' : 'Togli'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
                chip.state === 'saved' && 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
                chip.state === 'added' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                chip.state === 'removed' && 'border-dashed text-muted-foreground line-through'
              )}
            >
              {chip.state === 'saved' && <Check className='size-3' aria-hidden />}
              {nameOf.get(chip.id)}
              {chip.state === 'added' && <span className='font-normal'>· nuova</span>}
              {chip.state === 'removed' && <span className='font-normal no-underline'>· da togliere</span>}
              {chip.state !== 'removed' && <X className='size-3 opacity-60' aria-hidden />}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className='space-y-2'>
          <Skeleton className='h-9 w-full' />
          <Skeleton className='h-48 w-full' />
        </div>
      ) : (
        <>
          {subjects.length > 6 && (
            <div className={cn(stickySearch && 'sticky top-[var(--sticky-top)] z-10 -mx-2 bg-[var(--card)] px-2 py-2')}>
              <SearchField
                id='subject-search'
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder='Cerca una materia'
              />
            </div>
          )}
          {filteredSubjects.length === 0 ? (
            <EmptyState>{searchQuery ? 'Nessuna materia trovata.' : 'Nessuna materia disponibile.'}</EmptyState>
          ) : (
            <ul className='divide-y rounded-lg border'>
              {filteredSubjects.map((subject) => {
                const isSelected = value.includes(subject.id)
                const checkboxId = `subject-${subject.id}`
                return (
                  <li key={subject.id}>
                    <label
                      htmlFor={checkboxId}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 transition-colors',
                        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted/50',
                        isSelected && 'bg-primary/[0.03]'
                      )}
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={isSelected}
                        disabled={disabled}
                        onCheckedChange={() => handleToggle(subject.id)}
                      />
                      <span className={cn('min-w-0 flex-1 text-sm break-words', isSelected && 'font-medium')}>{subject.name}</span>
                      {isSelected && savedSet.has(subject.id) && saved && (
                        <span className='text-xs text-muted-foreground'>salvata</span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
