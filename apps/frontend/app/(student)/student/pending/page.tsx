'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  Download,
  ExternalLink,
  Hourglass,
  InfoIcon
} from 'lucide-react'

import { PageSkeleton } from '@/components/loading'
import { StatusBlock } from '@/components/status-block'
import { Button } from '@/components/ui/button'
import { ACTIVATION_FORM_URL, RELEASE_FORM_URL } from '@/lib/student-activation'
import { useSession } from '@/lib/use-session'

type Deactivation = { deactivatedAt?: string | null, deactivationReason?: string | null }

// Reads whether this account was active once and was turned off, and why; undefined while loading.
function useDeactivation() {
  const { profile } = useSession()
  const [state, setState] = React.useState<Deactivation | null | undefined>(undefined)
  React.useEffect(() => {
    if (!profile?.id) return
    fetch(`/api/users/${profile.id}`, { cache: 'no-store' })
      .then(response => (response.ok ? response.json() as Promise<Deactivation> : null))
      .catch(() => null)
      .then(setState)
  }, [profile?.id])
  return state
}

const contact = (
  <Link href='mailto:iepf@hensemberger.it' className='underline underline-offset-4'>
    iepf@hensemberger.it
  </Link>
)

function DeactivatedPage({ reason }: { reason: string | null }) {
  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={Ban}
        tone='warning'
        title='Account disattivato'
        footer={(
          <div className='space-y-4 text-left'>
            {reason && (
              <div className='rounded-lg border bg-card p-4 text-sm'>
                <p className='font-medium'>Motivo</p>
                <p className='mt-1 whitespace-pre-line text-muted-foreground'>{reason}</p>
              </div>
            )}
            <p className='text-center text-sm text-muted-foreground'>
              Per chiarimenti o per chiedere la riattivazione scrivi a {contact}.
            </p>
          </div>
        )}
      >
        <p>
          Il tuo account era attivo ed è stato disattivato dagli organizzatori:{' '}
          <span className='font-medium text-foreground'>non puoi prenotare lezioni</span>.
          Riceverai una mail se viene riattivato.
        </p>
      </StatusBlock>
    </main>
  )
}

function Step({
  n,
  title,
  children
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <li className='flex items-start gap-3'>
      <span className='flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'>
        {n}
      </span>
      <div className='min-w-0 flex-1 space-y-2 text-sm leading-relaxed text-muted-foreground'>
        <p className='font-medium text-foreground'>{title}</p>
        {children}
      </div>
    </li>
  )
}

// Every student lands here after signing up, before the school activates the account: the
// page has to make clear that nothing works yet and that the steps below are what unlocks it.
// A student turned off after being active gets the reason and the contact instead.
export default function StudentPendingPage() {
  const deactivation = useDeactivation()
  if (deactivation === undefined) return <PageSkeleton />
  if (deactivation?.deactivatedAt) return <DeactivatedPage reason={deactivation.deactivationReason ?? null} />
  return (
    <main className='flex flex-1'>
      <StatusBlock
        icon={Hourglass}
        tone='warning'
        title='Account in attesa di attivazione'
        wide
        footer={
          <div className='space-y-6 text-left'>
            <section className='rounded-lg border-2 border-primary/40 bg-card p-4 sm:p-6'>
              <h2 className='text-lg font-semibold'>
                Cosa devi fare per essere attivato
              </h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                Se non l&apos;hai già fatto, completa questi quattro passaggi.
              </p>
              <div className='mt-3 flex items-start gap-2 rounded-lg bg-muted p-3 text-sm'>
                <InfoIcon className='mt-0.5 size-4 shrink-0' aria-hidden />
                <p>
                  Per aprire la liberatoria e il form di attivazione devi
                  accedere con{' '}
                  <span className='font-medium'>
                    l&apos;account @hensemberger.it dello studente
                  </span>
                  .
                </p>
              </div>
              <ol className='mt-5 space-y-5'>
                <Step n={1} title='Scarica la liberatoria e il regolamento'>
                  <p>La trovi anche nella circolare di inizio progetto.</p>
                  <Button asChild variant='outline' size='sm'>
                    <Link href={RELEASE_FORM_URL} target='_blank'>
                      <Download className='size-4' /> Liberatoria e regolamento
                    </Link>
                  </Button>
                </Step>
                <Step
                  n={2}
                  title='Falla firmare da un genitore o tutore legale'
                >
                  <p>È obbligatorio per partecipare al progetto.</p>
                </Step>
                <Step
                  n={3}
                  title='Paga quando ricevi l’avviso della segreteria'
                >
                  <p>
                    L&apos;importo è nella circolare dell&apos;anno scolastico
                    in corso. Conserva la ricevuta.
                  </p>
                  <div className='flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200'>
                    <AlertTriangle
                      className='mt-0.5 size-4 shrink-0'
                      aria-hidden
                    />
                    <p>
                      L&apos;avviso può arrivare dopo alcuni giorni.{' '}
                      <span className='font-semibold'>
                        Non pagare prima di aver ricevuto l&apos;avviso con la
                        dicitura &quot;InsiemeÈ+Facile&quot; o simili.
                      </span>
                    </p>
                  </div>
                </Step>
                <Step
                  n={4}
                  title='Invia ricevuta e liberatoria firmata nel form'
                >
                  <div>
                    Dopo l&apos;invio la segreteria attiver&agrave;
                    l&apos;account e potrai prenotare le lezioni.
                    <div className='flex gap-2'>
                      <InfoIcon
                        className='mt-0.5 size-4 shrink-0'
                        aria-hidden
                      />
                      <p>
                        La segreteria attiva gli account una volta alla
                        settimana: se dopo qualche giorno il tuo account non è
                        ancora attivo, pazienta ancora un po&apos;. Grazie per
                        la comprensione.
                      </p>
                    </div>
                  </div>
                  <Button asChild size='sm'>
                    <Link href={ACTIVATION_FORM_URL} target='_blank'>
                      Apri il form di attivazione{' '}
                      <ExternalLink className='size-4' />
                    </Link>
                  </Button>
                </Step>
              </ol>
            </section>
            <p className='text-center text-sm text-muted-foreground'>
              Hai dubbi? Leggi le{' '}
              <Link href='/faq' className='underline underline-offset-4'>
                domande frequenti
              </Link>
              .
              <br />
              Il tuo account era già attivo ed è stato disattivato? Scrivici a{' '}
              <Link
                href='mailto:iepf@hensemberger.it'
                className='underline underline-offset-4'
              >
                iepf@hensemberger.it
              </Link>
              .
            </p>
          </div>
        }
      >
        <p>
          Il tuo account è stato creato, ma{' '}
          <span className='font-medium text-foreground'>
            non puoi ancora prenotare lezioni
          </span>
          . Riceverai una mail appena viene attivato.
        </p>
      </StatusBlock>
    </main>
  )
}
