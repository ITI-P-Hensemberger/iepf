import Image from 'next/image'
import Link from 'next/link'
import { CalendarCheck, GraduationCap, Lightbulb, LogIn, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { safeInternalPath } from '@/lib/safe-redirect'

const POINTS = [
  {
    icon: GraduationCap,
    title: 'Tutor del tuo istituto',
    text: 'Studenti più grandi, scelti per competenza e capacità di spiegare in modo chiaro e pratico.'
  },
  {
    icon: Lightbulb,
    title: 'Il metodo, non i compiti',
    text: 'Niente compiti svolti al posto tuo: capisci il metodo, chiarisci i dubbi e impari a fare gli esercizi da solo.'
  },
  {
    icon: CalendarCheck,
    title: 'Prenoti tu',
    text: 'Scegli la materia e il giorno, scrivi su cosa ti serve aiuto e la lezione è tua.'
  }
]

// The first page anyone sees: what the project is, and the two ways in. Signed-out users land
// here too (logout, expired session) with `next`, which "Accedi" hands on to the login.
export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  const nextPath = safeInternalPath(typeof next === 'string' ? next : null)
  const loginHref = nextPath ? `/auth/login?next=${encodeURIComponent(nextPath)}` : '/auth/login'
  return (
    // On a computer the content sits in the middle of the screen, between header and footer.
    <main className='flex flex-1 flex-col'>
      <div className='container mx-auto px-4 pt-12 pb-16 lg:my-auto'>
        <section className='mx-auto flex max-w-2xl flex-col items-center text-center'>
          <Image
            src='/logo.png'
            alt='InsiemeÈ+Facile'
            width={112}
            height={112}
            style={{ width: 'auto', height: 'auto', maxHeight: 112 }}
            draggable={false}
            priority
          />
          <h1 className='mt-8 text-3xl font-semibold tracking-tight text-balance sm:text-4xl'>
            Il supporto allo studio dell’
            <a
              href='https://hensemberger.edu.it/'
              target='_blank'
              rel='noopener noreferrer'
              className='ml-[0.1em] whitespace-nowrap text-[var(--school)] underline-offset-4 hover:underline'
            >
              ITI P. Hensemberger
            </a>
          </h1>
          <p className='mt-4 text-lg text-muted-foreground text-pretty'>
            Lezioni pomeridiane con i tutor della scuola, per consolidare i
            concetti fondamentali e affrontare con più sicurezza le materie in
            cui sei in difficoltà.
          </p>
          {/* The two ways in, the first thing to see after the title. */}
          <div className='mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row'>
            <Button asChild size='lg' className='h-12 px-8 text-base shadow-md sm:min-w-48'>
              <Link href='/auth/sign-up'><UserPlus className='size-5' /> Registrati</Link>
            </Button>
            <Button asChild size='lg' variant='outline' className='h-12 border-foreground/30 px-8 text-base sm:min-w-48'>
              <Link href={loginHref}><LogIn className='size-5' /> Accedi</Link>
            </Button>
          </div>
        </section>

        <section
          className='mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-3'
          aria-label='Come funziona'
        >
          {POINTS.map((point) => (
            <div key={point.title} className='rounded-lg border bg-card p-5'>
              <span className='flex size-10 items-center justify-center rounded-lg bg-primary/10'>
                <point.icon className='size-5 text-primary' aria-hidden />
              </span>
              <h2 className='mt-4 font-semibold'>{point.title}</h2>
              <p className='mt-1 text-sm text-muted-foreground'>{point.text}</p>
            </div>
          ))}
        </section>

        <p className='mt-12 text-center text-sm text-muted-foreground'>
          Hai domande su costi, attivazione o lezioni?
          <br />
          <Link
            href='/faq'
            className='font-medium text-foreground underline underline-offset-4'
          >
            Leggi le domande frequenti
          </Link>
        </p>
      </div>
    </main>
  )
}
