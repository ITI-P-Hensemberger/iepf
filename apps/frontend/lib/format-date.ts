import { schoolFormat } from '@/lib/school-time'

const ITALIAN_DATE_TIME_FORMATTER = schoolFormat({
  dateStyle: 'short',
  timeStyle: 'short'
})

export function formatItalianDate(value?: string | null) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return ITALIAN_DATE_TIME_FORMATTER.format(parsed)
}
