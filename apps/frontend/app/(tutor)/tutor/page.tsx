'use client'

import Link from 'next/link'

export default function TutorPage() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 py-10 flex flex-col items-center'>
        <h1 className='mt-6 text-2xl'>Area tutor</h1>
        <p className='mt-2 text-center max-w-md text-muted-foreground'>
          Questa è una pagina placeholder per i tutor attivi.
        </p>
        <Link href='/faq' className='mt-6 text-primary underline'>
          Vai alle FAQ
        </Link>
      </div>
    </main>
  )
}
