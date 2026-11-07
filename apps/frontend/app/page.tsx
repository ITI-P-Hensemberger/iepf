import Image from 'next/image'
import Link from 'next/link'
import { CalendarCheck, GraduationCap, Lightbulb } from 'lucide-react'

import { Button } from '@/components/ui/button'

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

// The first page anyone sees: what the project is, and the two ways in.
export default function Home() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-4 pt-12 pb-16'>
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
            Il supporto allo studio dell&apos;ITI P. Hensemberger
          </h1>
          <p className='mt-4 text-lg text-muted-foreground text-pretty'>
            Lezioni pomeridiane con i tutor della scuola, per consolidare i
            concetti fondamentali e affrontare con più sicurezza le materie in
            cui sei in difficoltà.
          </p>
          <div className='mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row'>
            <Button asChild size='lg'>
              <Link href='/auth/sign-up'>Registrati</Link>
            </Button>
            <Button asChild size='lg' variant='outline'>
              <Link href='/auth/login'>Accedi</Link>
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
