import { BackButton } from '@/components/back-button'
import Image from 'next/image'

const SECTIONS = [
  {
    title:
      '1. Titolare del trattamento e Resposabile della Protezione dei Dati (DPO)',
    body: [
      'Il Titolare del trattamento è:',
      'ITI P. Hensemberger',
      [
        'Via Giovanni Berchet, 2 - 20900 Monza (MB)',
        'Email istituzionale: mbtf410002@istruzione.it'
      ],
      'Il Responsabile della Protezione dei Dati (DPO) è contattabile al seguente indirizzo email: dpo@hensemberger.it'
    ]
  },
  {
    title: '2. Tipologie di dati trattati',
    body: [
      'Il Sito può trattare le seguenti categorie di dati personali:',
      'a) Dati anagrafici dello studente',
      [
        'nome e cognome',
        'classe e indirizzo di studio',
        'indirizzo email istituzionale dello studente'
      ],
      'b) Dati relativi al servizio',
      [
        'prenotazioni delle lezioni',
        'storico delle ore utilizzate',
        'informazioni organizzative connesse al Progetto',
        "stato del pagamento e copia della ricevuta PagoPA caricata per l'attivazione del servizio"
      ],
      'c) Dati tecnici di navigazione',
      [
        'indirizzo IP',
        'log di accesso',
        'dati tecnici necessari al funzionamento del sito',
        'cookie tecnici necessari alla gestione della sessione di autenticazione'
      ],
      'd) Statistiche di utilizzo',
      [
        "conteggi giornalieri di uso del Sito (pagine visitate, apertura delle notifiche, esito delle prenotazioni, errori tecnici), suddivisi solo per ruolo e anno di corso; non contengono nome, email, indirizzo IP né altri identificativi e non usano cookie;",
        "non vengono raccolte durante l'accesso di un amministratore al posto di un utente, né dai browser che inviano il segnale Global Privacy Control o Do Not Track;",
        'sono trattate esclusivamente sui server del Sito, senza servizi di analisi di terze parti.'
      ],
      'Tali dati non vengono utilizzati per finalità di profilazione o marketing.'
    ]
  },
  {
    title: '3. Finalità del trattamento',
    body: [
      'I dati personali sono trattati esclusivamente per le seguenti finalità:',
      [
        "gestione dell'adesione al Progetto “Insieme È Più Facile”;",
        'verifica della regolarità amministrativa (pagamento quota di iscrizione);',
        'organizzazione delle attività di supporto allo studio;',
        'gestione delle prenotazioni tramite piattaforma online;',
        'invio di comunicazioni di servizio;',
        'adempimento di obblighi amministrativi e organizzativi interni;',
        'sicurezza e corretto funzionamento del Sito;',
        'miglioramento del servizio attraverso statistiche di utilizzo aggregate.'
      ]
    ]
  },
  {
    title: '4. Base giuridica del trattamento',
    body: [
      'Il trattamento dei dati personali si fonda su:',
      "art. 6, par. 1, lett. e) GDPR (esecuzione di un compito di interesse pubblico connesso alle finalità educative dell'Istituto);",
      "art. 6, par. 1, lett. b) GDPR (esecuzione di attività richieste dall'interessato nell'ambito del servizio).",
      "Per i dati riferiti a soggetti minorenni, il trattamento avviene nell'ambito delle funzioni istituzionali dell'Istituto scolastico."
    ]
  },
  {
    title: '5. Modalità del trattamento',
    body: [
      "Il trattamento dei dati avviene mediante strumenti informatici e telematici, con logiche strettamente correlate alle finalità sopra indicate e con l'adozione di adeguate misure di sicurezza tecniche e organizzative atte a prevenire:",
      [
        'accessi non autorizzati;',
        'perdita dei dati;',
        'utilizzi illeciti o non conformi.'
      ],
      'I dati non sono oggetto di processi decisionali automatizzati né di profilazione.'
    ]
  },
  {
    title: '6. Conservazione dei dati',
    body: [
      'I dati personali saranno conservati:',
      [
        "per tutta la durata dell'anno scolastico di riferimento;",
        "per il tempo strettamente necessario all'adempimento degli obblighi amministrativi e organizzativi;",
        'secondo i termini previsti dalla normativa scolastica e archivistica vigente.'
      ],
      'Al termine, i dati saranno cancellati o anonimizzati.',
      'Le statistiche di utilizzo aggregate sono conservate per 13 mesi e poi cancellate automaticamente.'
    ]
  },
  {
    title: '7. Comunicazione e diffusione dei dati',
    body: [
      'I dati personali:',
      [
        'non saranno diffusi (non saranno pubblicati online o esposti al pubblico indistinto);',
        "Potranno essere comunicati o resi accessibili esclusivamente a: personale interno autorizzato (docenti referenti del Progetto e personale di segreteria per la gestione amministrativa), studenti Tutor (limitatamente al nome, cognome, classe e indirizzo email di istituto degli studenti assistiti per esclusive finalità organizzative - i tutor sono istruiti alla riservatezza), fornitori tecnici: soggetti che forniscono l'infrastruttura informatica o il servizio di hosting, nominati Responsabili del trattamento ai sensi dell'art. 28 del GDPR."
      ],
      'In nessun caso i dati saranno ceduti a soggetti terzi per finalità commerciali.'
    ]
  },
  {
    title: '8. Trasferimento dei dati extra UE',
    body: [
      'I dati personali non sono trasferiti verso Paesi extra Unione Europea ad esclusione degli USA (Google), per i quali il trasferimento avviene secondo le garanzie di legge (Data Privacy Framework).',
      'Qualora ciò si rendesse necessario per esigenze tecniche, il trasferimento avverrà esclusivamente nel rispetto degli articoli 44-49 del GDPR.'
    ]
  },
  {
    title: "9. Diritti dell'interessato",
    body: [
      "L'interessato, o chi esercita la responsabilità genitoriale, può in qualsiasi momento esercitare i diritti previsti dagli articoli 15-22 del GDPR, tra cui:",
      [
        'diritto di accesso ai dati;',
        'diritto di rettifica;',
        'diritto alla cancellazione (nei limiti consentiti);',
        'diritto di limitazione del trattamento;',
        'diritto di opposizione;',
        'diritto alla portabilità dei dati, ove applicabile.'
      ],
      'Le richieste possono essere inoltrate al Titolare del trattamento tramite i canali istituzionali.'
    ]
  },
  {
    title: "10. Reclamo all'Autorità Garante",
    body: [
      "Qualora l'interessato ritenga che il trattamento dei dati personali avvenga in violazione della normativa vigente, ha il diritto di proporre reclamo al:",
      'Garante per la Protezione dei Dati Personali',
      'www.garanteprivacy.it'
    ]
  },
  {
    title: "11. Aggiornamenti dell'Informativa sulla Privacy",
    body: [
      'La presente Informativa sulla Privacy può essere aggiornata o modificata in qualsiasi momento per adeguamenti normativi o organizzativi.',
      'Le modifiche saranno pubblicate sul Sito e avranno efficacia dalla data di pubblicazione.'
    ]
  }
]

export default function PrivacyPolicyPage() {
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
        <h1 className='mt-6 text-2xl font-bold'>Informativa sulla Privacy</h1>
        <p className='mt-2 text-center text-muted-foreground'>
          ai sensi dell&apos;art. 13 del Regolamento UE 2016/679 (GDPR)
        </p>
        <p className='mt-4 max-w-3xl text-justify'>
          La presente informativa descrive le modalità di trattamento dei dati
          personali degli utenti che accedono e utilizzano il sito web del
          progetto di supporto allo studio pomeridiano “Insieme È Più Facile”
          (di seguito, il “Sito”).
        </p>
        <p className='mt-3 max-w-3xl text-justify'>
          Il trattamento dei dati avviene nel rispetto dei principi di liceità,
          correttezza, trasparenza, minimizzazione e sicurezza, in conformità al
          Regolamento (UE) 2016/679 (GDPR) e alla normativa nazionale vigente.
        </p>
        <div className='mt-8 w-full max-w-4xl space-y-6 text-justify'>
          {SECTIONS.map((section) => (
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
