import Link from 'next/link'

function Footer() {
  return (
    <footer className='bottom-0 border-t bg-background/95 py-4 backdrop-blur'>
      <div className='container mx-auto px-4 text-center text-sm text-muted-foreground'>
        © {new Date().getFullYear()} ITI P. Hensemberger ·{' '}
        <Link href='/privacy-policy' className='underline underline-offset-4'>
          Privacy Policy
        </Link>
      </div>
    </footer>
  )
}

export default Footer
