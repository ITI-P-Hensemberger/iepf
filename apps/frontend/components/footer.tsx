import Link from 'next/link'

function Footer() {
  return (
    <footer className='fixed bottom-0 w-full p-4 text-center text-sm text-muted-foreground'>
      <div>
        <span>
          Utilizzando questo sito accetti la nostra{' '}
          <Link href='/privacy-policy' className='underline underline-offset-4'>
            Informativa sulla Privacy
          </Link>
          .
        </span>
      </div>
      <div className='mt-1'>
        © {new Date().getFullYear()} ITI P. Hensemberger. Tutti i diritti
        riservati.
      </div>
    </footer>
  )
}

export default Footer
