// Downloads the year report (.xlsx) from /api/admin/report and saves it with its own name.

export function filenameFrom(disposition: string | null) {
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null
  return match?.[1] ?? 'iepf-report.xlsx'
}

export async function downloadYearReport() {
  const response = await fetch('/api/admin/report', { cache: 'no-store' })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(payload.message ?? 'Impossibile generare il report.')
  }
  const filename = filenameFrom(response.headers.get('content-disposition'))
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Some browsers start the download only after this tick.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}
