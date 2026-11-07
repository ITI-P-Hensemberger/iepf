import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from './ui/accordion'
import Link from 'next/link'

import { ACTIVATION_FORM_URL, RELEASE_FORM_URL } from '@/lib/student-activation'

export default function FAQ() {
  return (
    <Accordion type='single' collapsible>
      <AccordionItem value='prezzi'>
        <AccordionTrigger>
          Quanto costa il servizio e quante lezioni comprende il pacchetto?
        </AccordionTrigger>
        <AccordionContent>
          Il contributo e il numero di lezioni del pacchetto sono indicati nella
          circolare dell&apos;anno scolastico in corso, che trovi nel registro
          elettronico.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='attivazione'>
        <AccordionTrigger>
          Come viene attivato il mio account dopo la registrazione?
        </AccordionTrigger>
        <AccordionContent>
          <ol className='list-decimal space-y-2 pl-5'>
            <li>
              Scarica il documento di liberatoria e regolamento che trovi nella
              circolare di inizio progetto.
            </li>
            <li>
              Fai compilare e firmare la liberatoria da un genitore o un tutore
              legale: è obbligatoria per partecipare al progetto.
            </li>
            <li>
              Attendi l&apos;avviso di pagamento dalla Segreteria Scolastica,
              che può arrivare dopo alcuni giorni, poi effettua il pagamento e
              conserva la ricevuta. Non pagare prima di aver ricevuto
              l&apos;avviso con la dicitura &quot;InsiemeÈ+Facile&quot; o
              simili.
            </li>
            <li>
              Allega la ricevuta di pagamento e la liberatoria firmata al form
              di attivazione. Una volta inviato il form, la segreteria attiverà
              il tuo account e potrai prenotare le lezioni.
            </li>
          </ol>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-1'>
        <AccordionTrigger>Come posso prenotare una lezione?</AccordionTrigger>
        <AccordionContent>
          Per prenotare una lezione, accedi al tuo account, seleziona la materia
          di interesse e scegli un giorno disponibile con il tutor desiderato.
          Riceverai una conferma via email.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-2'>
        <AccordionTrigger>
          Cosa succede se non posso partecipare a una lezione prenotata?
        </AccordionTrigger>
        <AccordionContent>
          In caso di impossibilità a partecipare, è possibile cancellare la
          lezione fino alla mezzanotte del giorno prima. Dopo questo termine, la
          lezione non verrà rimborsata.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-3'>
        <AccordionTrigger>
          Quali sono gli orari disponibili per le lezioni con i tutor?
        </AccordionTrigger>
        <AccordionContent>
          Le lezioni con i tutor sono disponibili dal lunedì al venerdì, dalle
          14:00 alle 15:00 e dalle 15:00 alle 16:00. I giorni possono variare in
          base alla disponibilità dei tutor.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-4'>
        <AccordionTrigger>
          Posso usare le lezioni per qualsiasi materia?
        </AccordionTrigger>
        <AccordionContent>
          Sì, le lezioni sono disponibili per tutte le materie previste dal
          piano di studi dell&apos;Istituto Hensemberger. Tuttavia, la
          disponibilità può variare in base alla domanda e alle risorse dei
          tutor.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-5'>
        <AccordionTrigger>
          Cosa succede se esaurisco il pacchetto di lezioni prima della fine
          dell&apos;anno scolastico?
        </AccordionTrigger>
        <AccordionContent>
          In tal caso, sarà possibile acquistare pacchetti aggiuntivi di lezioni
          secondo le modalità comunicate dalla Segreteria Didattica.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-6'>
        <AccordionTrigger>
          Cosa succede se non esaurisco il pacchetto di lezioni prima della fine
          dell&apos;anno scolastico?
        </AccordionTrigger>
        <AccordionContent>
          Le lezioni non utilizzate non sono rimborsabili e non possono essere
          trasferite all&apos;anno successivo.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
