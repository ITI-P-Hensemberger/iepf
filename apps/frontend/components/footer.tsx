import Link from 'next/link'

function Footer() {
  return (
    <footer className='bottom-0 border-t bg-background/95 py-4 backdrop-blur'>
      <div className='container mx-auto px-4 text-center text-sm text-muted-foreground'>
        <div className='flex flex-col items-center gap-2 sm:flex-row sm:justify-center'>
          <span>© {new Date().getFullYear()} ITI P. Hensemberger</span>
          <span className='hidden sm:inline'>·</span>
          <Link href='/privacy-policy' className='underline underline-offset-4'>
            Informativa sulla privacy
          </Link>
          <span className='hidden sm:inline'>·</span>
          <Link href='/terms' className='underline underline-offset-4'>
            Termini e condizioni
          </Link>
        </div>
      </div>
    </footer>
  )
}

export default Footer
