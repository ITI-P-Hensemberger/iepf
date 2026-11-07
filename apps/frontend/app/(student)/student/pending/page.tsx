'use client'

import Link from 'next/link'
import { AlertTriangle, UserRoundX } from 'lucide-react'

import { StatusBlock } from '@/components/status-block'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { logout } from '@/lib/auth-client'
import { ACTIVATION_FORM_URL, RELEASE_FORM_URL } from '@/lib/student-activation'

export default function StudentPendingPage() {
  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={UserRoundX}
        title='Account non attivo'
        actions={<>
          <Button asChild variant='outline'>
            <Link href='/faq'>Domande frequenti</Link>
          </Button>
          <Button variant='destructive' onClick={() => void logout()}>
            Esci
          </Button>
        </>}
      wide
      footer={
        <div className='rounded-lg border bg-card p-4 text-left sm:p-6'>
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
                    href={RELEASE_FORM_URL}
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
                  Nel frattempo riceverai l&apos;avviso di pagamento dalla
                  Segreteria Scolastica: l&apos;importo è indicato nella
                  circolare dell&apos;anno scolastico in corso. <br />
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
                    href={ACTIVATION_FORM_URL}
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
        </div>
      }
      >
        <p>
          Il tuo account non è ancora attivo oppure è stato disattivato.
          Riceverai una mail quando verrà attivato.
        </p>
        <p className='mt-2'>
          Se pensi si tratti di un errore, contattaci a{' '}
          <Link href='mailto:iepf@hensemberger.it' className='underline underline-offset-4'>
            iepf@hensemberger.it
          </Link>
          .
        </p>
      </StatusBlock>
    </main>
  )
}
