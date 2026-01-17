import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from './ui/accordion'

export default function FAQ() {
  return (
    <Accordion type='single' collapsible>
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
          15:00 alle 16:00. I giorni possono variare in base alla disponibilità
          dei tutor.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-4'>
        <AccordionTrigger>
          Posso usare le lezioni per qualsiasi materia?
        </AccordionTrigger>
        <AccordionContent>
          Sì, le lezioni sono disponibili per tutte le materie previste dal
          piano di studi dell'Istituto Hensemberger. Tuttavia, la disponibilità
          può variare in base alla domanda e alle risorse dei tutor.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-5'>
        <AccordionTrigger>
          Cosa succede se esaurisco le 30 lezioni prima della fine dell'anno
          scolastico?
        </AccordionTrigger>
        <AccordionContent>
          In tal caso, sarà possibile acquistare pacchetti aggiuntivi di lezioni
          secondo le modalità comunicate dalla Segreteria Didattica.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value='item-6'>
        <AccordionTrigger>
          Cosa succede se non esaurisco le 30 lezioni prima della fine dell'anno
          scolastico?
        </AccordionTrigger>
        <AccordionContent>
          Le lezioni non utilizzate non sono rimborsabili e non possono essere
          trasferite all'anno successivo.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
