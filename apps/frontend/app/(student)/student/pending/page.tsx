'use client'

import Image from 'next/image'
import Link from 'next/link'
import { AlertTriangle, ArrowDown } from 'lucide-react'

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
                Se pensi si tratti di un errore, contattaci a{' '}
                <Link
                  href='mailto:iepf@hensemberger.it'
                  className='underline underline-offset-4'
                >
                  iepf@hensemberger.it
                </Link>
                .
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div>
              <p className='text-sm font-medium'>
                Checklist per l&apos;attivazione iniziale
              </p>
              <Separator className='my-3' />
              <ol className='space-y-4'>
                <li className='flex items-start gap-3'>
                  <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold'>
                    1
                  </span>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    Scarica il documento di liberatoria e regolamento.
                    <br />
                    Lo trovi nella circolare di inizio progetto oppure al
                    seguente link:{' '}
                    <Link
                      href='https://hensembergermonza-my.sharepoint.com/:b:/g/personal/iepf_hensemberger_it/IQA_QdT0Y57qRL3nYwkCsEw1ATbNluKV0Ba-nMZE4gSaHW8?e=6vwbjX'
                      target='_blank'
                      className='underline underline-offset-4'
                    >
                      Liberatoria e Regolamento
                    </Link>
                  </p>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold'>
                    2
                  </span>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    Fai compilare e firmare la liberatoria da un genitore o un
                    tutore legale.
                    <br />
                    Questo passaggio è obbligatorio per poter partecipare al
                    progetto.
                  </p>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold'>
                    3
                  </span>
                  <p className='text-sm leading-relaxed text-muted-foreground'>
                    Nel frattempo riceverai l&apos;avviso di pagamento di €50,00
                    dalla Segreteria Scolastica. <br />
                    Effettua il pagamento e conserva la ricevuta.
                    <span className='mt-2 flex items-start gap-2 text-sm font-medium uppercase text-yellow-600 bg-amber-100 p-2 rounded-lg'>
                      <AlertTriangle
                        className='mt-0.5 shrink-0'
                        style={{ width: 18, height: 18 }}
                      />
                      <span>
                        <span className='font-semibold'>Attenzione:</span>{' '}
                        l&apos;invio dell&apos;avviso di pagamento da parte
                        della segreteria non avviene immediatamente. Potresti
                        dover attendere alcuni giorni prima di riceverlo.{' '}
                        <span className='font-semibold'>
                          Non effettuare il pagamento prima di aver ricevuto
                          l&apos;avviso con dicitura &quot;
                          <span className='capitalize'>InsiemeÈ+Facile</span>
                          &quot; o simili!
                        </span>
                      </span>
                    </span>
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
                      href='https://forms.cloud.microsoft/e/BzQUy21yt7'
                      target='_blank'
                      className='underline underline-offset-4'
                    >
                      Form di attivazione
                    </Link>
                    .
                    <br />
                    <br />
                    Una volta inviato il form, la segreteria procederà ad
                    attivare l&apos;account e potrai iniziare a prenotare le
                    lezioni.
                  </p>
                </li>
              </ol>
            </div>
            <div className='rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground'>
              Mentre attendi l&apos;attivazione dai un&apos;occhiata alle
              Domande Frequenti{' '}
              <ArrowDown className='ml-1 inline-block h-4 w-4' />
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
