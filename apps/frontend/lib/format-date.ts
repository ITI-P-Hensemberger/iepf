const ITALIAN_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('it-IT', {
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
