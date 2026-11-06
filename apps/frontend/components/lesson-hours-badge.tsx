import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { hasNoHoursLeft } from '@/lib/lesson-hours'

// The student's remaining hours; at zero it turns into a warning.
export function LessonHoursBadge({ tokens, className }: { tokens: number | null | undefined, className?: string }) {
  const empty = hasNoHoursLeft(tokens)
  return (
    <Badge variant={empty ? 'warning' : 'secondary'} className={className}>
      {empty && <AlertTriangle className='h-3.5 w-3.5' />}
      Ore di lezione rimanenti: {tokens ?? '-'}
    </Badge>
  )
}
