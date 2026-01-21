'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { logout } from '@/lib/auth-client'

export default function StudentPendingPage() {
  async function handleLogout() {
    await logout()
    // logout() handles the redirect to /auth/login
  }

  return (
    <main className='flex-1'>
      <div className='container mx-auto px-8 py-10 flex flex-col items-center'>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={125}
          height={125}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <Card className='mt-6 w-full max-w-2xl'>
          <CardHeader className='text-center'>
            <CardTitle>Account non attivo</CardTitle>
            <CardDescription>
              Il tuo account non è ancora attivo oppure è stato disattivato.{' '}
              <br />
              Riceverai una mail quando verrà attivato.
              <br />
              <span className='mt-2 block'>
                Se pensi si tratti di un errore, contatta i referenti del
                progetto.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div>
              <p className='text-sm font-medium'>
                Checklist per l'attivazione iniziale
              </p>
              <Separator className='my-3' />
              <ol className='space-y-4'>
                <li className='flex items-start gap-3'>
                  <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold'>
                    1
                  </span>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    Scarica il documento di liberatoria e regolamento inviato
                    via circolare
                  </p>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold'>
                    2
                  </span>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    Fai compilare e firmare la liberatoria da un genitore o un
                    tutore legale
                    <br />
                    Questo passaggio è obbligatorio per poter partecipare al
                    progetto
                  </p>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold'>
                    3
                  </span>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    Nel frattempo riceverai l'avviso di pagamento di €50,00
                    dalla Segreteria Scolastica. <br />
                    Effettua il pagamento e conserva la ricevuta.
                  </p>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold'>
                    4
                  </span>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    Compila e allega la ricevuta di pagamento e la liberatoria
                    firmata al seguente form: <br />
                    <Link
                      href='https://forms.gle/QMBZ2HXbSryjnVuv8'
                      target='_blank'
                      className='underline underline-offset-4'
                    >
                      Form di attivazione
                    </Link>
                    <br />
                    <br />
                    Una volta inviato il form, la segreteria procederà ad
                    attivare l'account e potrai iniziare a prenotare le lezioni.
                  </p>
                </li>
              </ol>
            </div>
            <div className='rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground'>
              Mentre attendi l'attivazione dai un'occhiata alle Domande
              Frequenti <ArrowDown className='ml-1 inline-block h-4 w-4' />
            </div>

            <div className='flex justify-center'>
              <Button asChild className='w-full sm:w-auto'>
                <Link href='/faq' className='w-full sm:w-auto'>
                  Domande Frequenti
                </Link>
              </Button>
            </div>
            <Separator />
            <div className='flex justify-center'>
              <Button
                variant='destructive'
                className='w-full sm:w-auto cursor-pointer'
                onClick={handleLogout}
              >
                Esci
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
