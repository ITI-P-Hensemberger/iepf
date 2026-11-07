CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "faqs_position_idx" ON "faqs" USING btree ("position");--> statement-breakpoint
-- The questions that were written in the page until now, so the FAQ is not empty after the deploy.
INSERT INTO "faqs" ("id", "question", "answer", "position") VALUES
(gen_random_uuid(), $$Quanto costa il servizio e quante lezioni comprende il pacchetto?$$, $$Il contributo e il numero di lezioni del pacchetto sono indicati nella circolare dell'anno scolastico in corso, che trovi nel registro elettronico.$$, 0),
(gen_random_uuid(), $$Come viene attivato il mio account dopo la registrazione?$$, $$1. Scarica il documento di liberatoria e regolamento che trovi nella circolare di inizio progetto.
2. Fai compilare e firmare la liberatoria da un genitore o un tutore legale: è obbligatoria per partecipare al progetto.
3. Attendi l'avviso di pagamento dalla Segreteria Scolastica, che può arrivare dopo alcuni giorni, poi effettua il pagamento e conserva la ricevuta. Non pagare prima di aver ricevuto l'avviso con la dicitura "InsiemeÈ+Facile" o simili.
4. Allega la ricevuta di pagamento e la liberatoria firmata al form di attivazione. Una volta inviato il form, la segreteria attiverà il tuo account e potrai prenotare le lezioni.

Per aprire la liberatoria e il form di attivazione devi accedere con l'account @hensemberger.it dello studente.$$, 1),
(gen_random_uuid(), $$Come posso prenotare una lezione?$$, $$Per prenotare una lezione, accedi al tuo account, seleziona la materia di interesse e scegli un giorno disponibile con il tutor desiderato. Riceverai una conferma via email.$$, 2),
(gen_random_uuid(), $$Cosa succede se non posso partecipare a una lezione prenotata?$$, $$In caso di impossibilità a partecipare, è possibile cancellare la lezione fino alla mezzanotte del giorno prima. Dopo questo termine, la lezione non verrà rimborsata.$$, 3),
(gen_random_uuid(), $$Quali sono gli orari disponibili per le lezioni con i tutor?$$, $$Le lezioni con i tutor sono disponibili dal lunedì al venerdì, dalle 14:00 alle 15:00 e dalle 15:00 alle 16:00. I giorni possono variare in base alla disponibilità dei tutor.$$, 4),
(gen_random_uuid(), $$Posso usare le lezioni per qualsiasi materia?$$, $$Sì, le lezioni sono disponibili per tutte le materie previste dal piano di studi dell'Istituto Hensemberger. Tuttavia, la disponibilità può variare in base alla domanda e alle risorse dei tutor.$$, 5),
(gen_random_uuid(), $$Cosa succede se esaurisco il pacchetto di lezioni prima della fine dell'anno scolastico?$$, $$In tal caso, sarà possibile acquistare pacchetti aggiuntivi di lezioni secondo le modalità comunicate dalla Segreteria Didattica.$$, 6),
(gen_random_uuid(), $$Cosa succede se non esaurisco il pacchetto di lezioni prima della fine dell'anno scolastico?$$, $$Le lezioni non utilizzate non sono rimborsabili e non possono essere trasferite all'anno successivo.$$, 7);
