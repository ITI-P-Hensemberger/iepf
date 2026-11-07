import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Under every paged list: which rows are shown out of how many, and the arrows only when there
// is more than one page.
export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  loading = false,
  className
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  loading?: boolean
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)
  return (
    <div className={cn('flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between', className)}>
      <span className='tabular-nums'>{total === 0 ? 'Nessun risultato' : `${first}–${last} di ${total}`}</span>
      {totalPages > 1 && (
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => onPageChange(page - 1)} disabled={page <= 1 || loading}>
            Precedente
          </Button>
          <span className='tabular-nums'>{page} / {totalPages}</span>
          <Button variant='outline' size='sm' onClick={() => onPageChange(page + 1)} disabled={page >= totalPages || loading}>
            Successiva
          </Button>
        </div>
      )}
    </div>
  )
}
