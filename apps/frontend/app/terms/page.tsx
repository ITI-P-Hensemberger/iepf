import { BackButton } from '@/components/back-button'
import Image from 'next/image'

const TERMS = [
  {
    title: '1. Oggetto del servizio',
    body: [
      "Il sito web consente la gestione e l'organizzazione della partecipazione degli studenti al Progetto di supporto allo studio pomeridiano, che si svolge presso i locali dell'Istituto scolastico, nella fascia oraria 15:00 - 16:00.",
      'Tramite il sito è possibile, a titolo esemplificativo:',
      [
        'effettuare prenotazioni delle lezioni;',
        'ricevere comunicazioni di servizio;',
        'gestire le informazioni relative alla partecipazione al Progetto.'
      ]
    ]
  },
  {
    title: '2. Accettazione del regolamento',
    body: [
      "L'Utente dichiara di aver letto, compreso e accettato integralmente il regolamento del Progetto, di cui i presenti Termini e Condizioni costituiscono trasposizione digitale e riepilogo vincolante.",
      "L'accettazione è condizione necessaria per l'accesso e l'utilizzo del servizio."
    ]
  },
  {
    title: '3. Modalità di sorveglianza e responsabilità',
    body: [
      "L'Utente dichiara di essere pienamente consapevole e di accettare che:",
      [
        'durante ciascuna ora di lezione, la sorveglianza e la responsabilità diretta dello studente sono affidate esclusivamente al Tutor maggiorenne che eroga la lezione;',
        "non è prevista la presenza né la supervisione attiva di personale docente o ATA durante l'attività didattica;",
        'il personale scolastico garantisce esclusivamente un presidio generale degli spazi comuni, con eventuale intervento solo in caso di emergenza segnalata dal Tutor.'
      ]
    ]
  },
  {
    title: "4. Esonero di responsabilità dell'Istituto",
    body: [
      "In virtù di quanto indicato all'articolo 3, l'Utente solleva l'Istituto scolastico e il suo personale da ogni responsabilità civile e penale per eventuali danni subiti o causati dallo studente durante lo svolgimento delle attività del Progetto.",
      "Restano esclusi i casi di dolo o colpa grave direttamente imputabili all'organizzazione."
    ]
  },
  {
    title: '5. Condizioni economiche',
    body: [
      "L'Utente accetta le seguenti condizioni economiche:",
      [
        'il costo di partecipazione è pari a € 50,00 per un pacchetto di 30 ore di lezione;',
        'il pagamento deve essere effettuato anticipatamente tramite sistema PagoPA per poter accedere al servizio;',
        "il pacchetto di ore ha validità limitata all'anno scolastico in corso;",
        'le ore non usufruite entro la conclusione delle attività non sono in alcun caso rimborsabili, né parzialmente né totalmente.'
      ]
    ]
  },
  {
    title: '6. Codice di comportamento',
    body: [
      "L'Utente si impegna a garantire che lo studente:",
      [
        'mantenga un comportamento corretto, rispettoso ed educato nei confronti dei Tutor, degli altri studenti e del personale scolastico;',
        "utilizzi in modo appropriato i locali e le attrezzature dell'Istituto."
      ],
      "La violazione di tali norme potrà comportare la sospensione o l'esclusione dal Progetto, a insindacabile giudizio del Docente Referente, senza diritto ad alcun rimborso."
    ]
  },
  {
    title: '7. Canale ufficiale di comunicazione',
    body: [
      "L'Utente accetta che tutte le comunicazioni ufficiali relative al Progetto (prenotazioni, conferme, promemoria, annullamenti, avvisi) vengano inviate esclusivamente all'indirizzo di posta elettronica istituzionale dello studente:",
      'nome.cognome@itismonza.it',
      "L'Utente si assume la responsabilità di monitorare tale canale o di verificare che lo studente lo consulti regolarmente."
    ]
  },
  {
    title: '8. Modalità di erogazione del servizio',
    body: [
      'Il servizio si basa sulla disponibilità volontaria dei Tutor.',
      'Di conseguenza:',
      [
        'non è garantita la presenza continuativa di Tutor per tutte le materie;',
        "la disponibilità può variare nel corso dell'anno scolastico."
      ]
    ]
  },
  {
    title: '9. Trattamento dei dati personali (Privacy)',
    body: [
      "L'Utente autorizza l'ITI P. Hensemberger al trattamento dei dati personali dello studente ai sensi del Regolamento UE 2016/679 (GDPR), esclusivamente per finalità connesse alla gestione del Progetto, tra cui:",
      [
        'gestione delle prenotazioni sulla piattaforma;',
        'comunicazioni di servizio;',
        'attività amministrative e reportistica interna.'
      ],
      'I dati non saranno utilizzati per finalità diverse da quelle sopra indicate.'
    ]
  },
  {
    title: '10. Accettazione finale',
    body: [
      "L'utilizzo del sito web e dei servizi collegati comporta la piena accettazione dei presenti Termini e Condizioni, senza riserve.",
      "Con tale accettazione, l'Utente autorizza la partecipazione dello studente al Progetto “Insieme È Più Facile” alle condizioni qui indicate."
    ]
  }
]

export default function TermsPage() {
  return (
    <main className='flex-1'>
      <div className='container mx-auto px-8 py-10 flex flex-col items-center'>
        <div className='mb-6 self-start'>
          <BackButton />
        </div>
        <Image
          src='/logo.png'
          alt='IEPF Logo'
          width={125}
          height={125}
          style={{ width: 'auto', height: 'auto' }}
          draggable={false}
          priority
        />
        <h1 className='mt-6 text-2xl font-bold text-center'>
          Termini e Condizioni di Utilizzo del Sito Web
        </h1>
        <p className='mt-2 text-center text-muted-foreground'>
          Progetto “Insieme È Più Facile”
        </p>
        <p className='mt-6 max-w-3xl text-justify'>
          I presenti Termini e Condizioni disciplinano l&apos;accesso e l&apos;utilizzo
          del sito web dedicato al progetto di supporto allo studio pomeridiano
          &quot;Insieme È Più Facile&quot; (di seguito, il &quot;Progetto&quot;), promosso dall&apos;ITI
          P. Hensemberger.
        </p>
        <p className='mt-3 max-w-3xl text-justify'>
          L&apos;utilizzo del sito e dei relativi servizi comporta l&apos;accettazione
          integrale dei presenti Termini e Condizioni da parte del genitore o
          del soggetto esercente la responsabilità genitoriale (di seguito,
          l&apos;&quot;Utente&quot;).
        </p>
        <div className='mt-8 w-full max-w-4xl space-y-6 text-justify'>
          {TERMS.map((section) => (
            <section key={section.title} className='space-y-2'>
              <h2 className='text-lg font-semibold text-start'>
                {section.title}
              </h2>
              {section.body.map((item) =>
                Array.isArray(item) ? (
                  <ul
                    key={item.join('-')}
                    className='list-disc space-y-1 pl-5 text-start'
                  >
                    {item.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={item}>{item}</p>
                )
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
