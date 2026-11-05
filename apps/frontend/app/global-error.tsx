'use client'

import * as React from 'react'

// Replaces the root layout when that fails, so it cannot rely on the app's styles.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang='it'>
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '32rem', margin: '20vh auto', padding: '0 1rem', textAlign: 'center' }}>
        <h1>Qualcosa è andato storto</h1>
        <p>Non è stato possibile caricare l&apos;applicazione. Riprova tra qualche istante.</p>
        <button type='button' onClick={reset}>Riprova</button>
      </body>
    </html>
  )
}
