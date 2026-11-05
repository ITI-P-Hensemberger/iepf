# Piano TODO IEPF

Punti da fare, in ordine di priorità e di implementazione. Il numero è la posizione nel
piano: le dipendenze usano questi numeri. Controlli eseguiti il 2026-11-04 su `main`
(`ff59413`) e, per gli header e i 404, con richieste pubbliche a
`https://iepf.hensemberger.it`.

Un push su `main` va in produzione: ogni PR unita è un deploy.

La rotazione dei segreti è già stata valutata e non fa parte di questo piano. Sono già
confermati corretti, quindi non sono da correggere: la stessa ora con materie diverse e
l'assenza di un limite per gli argomenti.

## Stato

I punti 2-9 sono uniti a `main` e in produzione. Il punto 1 è rimandato. I punti 11-25 non sono iniziati.

## Legenda

- **Evidenza**
  - `Verificato`: osservato eseguendo un comando, misurando o interrogando la produzione.
    L'assenza di qualcosa nel codice (un file, una voce di configurazione) rientra qui.
  - `Letto nel codice`: bug dedotto leggendo il codice, **non riprodotto**. Il primo passo
    è un test che lo dimostri; se il test non lo conferma, si chiude il punto.
  - `Da verificare`: dipende da uno stato non visibile dal repository, di solito sul server.
- **Stima**: S fino a mezza giornata, M 1-2 giorni, L più di 2 giorni.
- **PR**: `dedicata` significa che non va unita ad altro lavoro. Se non è indicata, il
  punto può stare con altri dello stesso ambito.

## Ordine: cosa cambia rispetto alla lista iniziale

| Punto | Posizione iniziale | Posizione ora | Motivo |
|---|---:|---:|---|
| Backup e ripristino | 9 | 1 | È l'unico rischio di perdita irreversibile, non tocca il codice in produzione e conviene chiuderlo prima di una serie di deploy. |
| Rimozione di `next-pwa` | 3 | 2 | Va prima dell'aggiornamento: toglie 49 segnalazioni e un plugin webpack da `next.config.ts`, quindi l'aggiornamento è più piccolo. |
| Aggiornamento dipendenze | 1 | 3 | Slitta solo per far passare i due punti sopra. |
| Dependabot o Renovate | 2 | 4 | Se attivato dopo l'aggiornamento, non apre decine di PR su versioni già superate. |
| Monitoraggio | 8 | 5 | Va prima dei fix di autenticazione: un timer di backup rotto oggi non si vedrebbe, e il punto 1 perderebbe valore. |
| Email con maiuscole | 7 | 8 | Scambiato con il punto sugli inviti: è più piccolo, più probabile (ad esempio con le maiuscole automatiche dei telefoni) e blocca del tutto l'accesso. Un invito bruciato invece si può riemettere. |
| Redirect dopo il login | 11 | 10 | Primo in MEDIA: è una correzione di sicurezza piccola e isolata. |
| Log degli indirizzi email | 14 | 12 | Anticipato perché è piccolo e riguarda dati personali. |
| `SIGTERM` e pool | 12 | 13 | Scende di poco, ma resta prima della coda email che ne riduce il bisogno. |
| Indici | 16 | 14 | Anticipato: servono al job di pulizia (15) e alla paginazione (16). |
| Proxy: asset e link email | 19 | 17 | Tocca lo stesso file del punto 6 e ha effetti visibili agli utenti, quindi precede `error.tsx`. |
| Coda email | 13 | 19 | È il lavoro più grande di MEDIA, e il punto 13 ne attenua già il rischio principale. |
| CI e deploy | 25 | 20 | Primo in MANUTENZIONE perché è l'unico che riguarda la sicurezza. |
| Pulizia | 24 | 21 | Piccola e poco rischiosa, riduce il rumore per i punti successivi. |
| Test end-to-end | 23 | 22 | Devono esistere prima dei refactor 24 e 25, che altrimenti non hanno una rete di sicurezza. |
| Contratto API | 20 | 23 | I tipi generati rendono più sicuri i refactor successivi. |

I punti non in tabella (6 logout, 7 rotazione, 9 inviti, 11 header, 15 conservazione,
16 paginazione, 18 `error.tsx`, 24 file enormi, 25 caricamento dati) mantengono l'ordine
relativo oppure si spostano solo per effetto degli spostamenti sopra.

I punti 1 e 5 sono operativi e possono procedere in parallelo agli altri.

---

## ALTA

- [ ] **1. Provare il ripristino dei backup e verificare la cifratura** (rimandato per
  decisione dell'utente il 2026-11-04: non bloccare gli altri punti)
  - **Problema:** il ripristino non risulta provato. `backup.sh` carica su Google Drive un
    dump con dati degli studenti, senza cifratura nello script.
  - **File:** `infra/deploy/backup.sh`, `infra/deploy/README.md`
  - **Evidenza:** `Verificato` per l'assenza di cifratura nello script. `Da verificare` se
    il remote `gdrive:` è di tipo `crypt`, con `rclone config show gdrive` sulla VPS.
  - **Fatto quando:** un dump reale scaricato da Drive è stato ripristinato su una copia
    isolata, con conteggi delle tabelle confrontati; data e durata sono annotate nel
    runbook; il dump su Drive è cifrato, con la chiave conservata fuori dalla VPS, oppure
    il rischio è accettato per iscritto.
  - **Attenzione:** i comandi del runbook eseguono `DROP DATABASE`: non vanno lanciati sul
    database di produzione per questa prova. Se si introduce la cifratura, i vecchi dump in
    chiaro restano su Drive fino alla scadenza dei 30 giorni, o vanno eliminati a mano.
  - **Stima:** M
  - **Dipendenze:** nessuna

- [x] **2. Rimuovere `next-pwa`**
  - **Stato:** Le segnalazioni tolte sono 51, non 49 (da 174 a 123). La storia mostra Next 16 solo da gennaio 2026, quindi le release precedenti potevano aver registrato un service worker: `/sw.js` ora serve uno script che svuota le sue cache e lo rimuove. Il file si potrà togliere più avanti.
  - **Problema:** il plugin non produce nulla: in produzione `/sw.js` e `/manifest.json`
    danno 404. Pesa comunque 49 segnalazioni di audit, tutte raggiungibili solo tramite
    `next-pwa`.
  - **File:** `apps/frontend/next.config.ts`, `apps/frontend/package.json`,
    `apps/frontend/types/next-pwa.d.ts`, `apps/frontend/public/offline.html`,
    `pnpm-lock.yaml`
  - **Evidenza:** `Verificato` (404 in produzione, conteggio da `pnpm audit --prod --json`).
    `offline.html` risponde 200, ma nel codice è citato solo da `next.config.ts`.
  - **Fatto quando:** dipendenza, wrapper e file di tipi sono rimossi; `offline.html` è
    rimosso; build e test passano; il conteggio di `pnpm audit --prod` scende di conseguenza.
  - **Da controllare:** se una vecchia versione in produzione ha registrato un service
    worker nei browser degli utenti. In quel caso serve un piano per disattivarlo.
  - **Stima:** S
  - **PR:** dedicata. Tocca il lockfile, quindi va unita prima del punto 3.
  - **Dipendenze:** nessuna

- [x] **3. Aggiornare le dipendenze**
  - **Stato:** `pnpm audit --prod`: resta 1 moderata in `serveStatic` di `@hono/node-server`, non usato dal backend e corretto solo nella 2.x. Quattro regole `react-hooks` nuove sono warning (65 errori sul codice esistente): vanno riportate a errore col punto 25. Provati nel browser login, prenotazione, annullamento e, via Mailpit, l'invio email.
  - **Problema:** `pnpm audit --prod` riporta 174 segnalazioni: 4 critiche, 74 alte, 82
    moderate, 14 basse. I moduli con più avvisi sono `next` (38), `hono` (34) e `nodemailer`
    (20). Le 4 critiche di Next non sembrano sfruttabili qui (Linux Alpine, niente
    `use cache`, solo immagini locali), giudizio basato sulle descrizioni degli advisory.
    Restano rilevanti bypass del proxy, DoS e SSRF.
  - **File:** `apps/frontend/package.json`, `apps/backend/package.json`,
    `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `docs/cutover.md` (nota sul lockfile)
  - **Evidenza:** `Verificato` (conteggi). `next@16.4.5` esiste ed è l'ultima versione
    stabile; le correzioni richieste dagli advisory arrivano fino a `>=16.4.1`.
  - **Fatto quando:** Next è alla 16.4.5 con `next` ed `eslint-config-next` dichiarati alla
    stessa versione esatta; `hono`, `@hono/node-server`, `drizzle-orm`, `nodemailer` e `zod`
    sono aggiornati; `overrides` contiene solo voci ancora necessarie; non restano
    segnalazioni critiche né alte oppure ognuna è motivata; typecheck, lint e `make test`
    passano; login, prenotazione e cancellazione sono provati a mano prima del merge.
  - **Stima:** L
  - **PR:** dedicata, come richiede `docs/cutover.md`. Tenere separati il ricalcolo del
    lockfile e ogni modifica di codice imposta dagli aggiornamenti, almeno in commit distinti.
  - **Dipendenze:** 2

- [x] **4. Aggiungere Dependabot o Renovate**
  - **Stato:** File validato con lo schema ufficiale; il primo run per npm è fallito con 17 errori perché Dependabot rifiuta versioni con meno di 3 giorni e il punto 3 ne aveva appena installate. Si sblocca da solo entro il 7 novembre; `minimumReleaseAge` nel workspace evita che si ripeta. Da controllare il primo run successivo.
  - **Problema:** nessun aggiornamento automatico è configurato, e infatti si sono accumulate
    le 174 segnalazioni.
  - **File:** nuovo `.github/dependabot.yml` (o `renovate.json`)
  - **Evidenza:** `Verificato` (`.github/` contiene solo `workflows/`)
  - **Fatto quando:** sono coperti pnpm, GitHub Actions e immagini Docker, con aggiornamenti
    raggruppati e frequenza settimanale; la prima tornata di PR è arrivata. Niente
    auto-merge: ogni merge è un deploy.
  - **Stima:** S
  - **Dipendenze:** 3

- [x] **5. Aggiungere il monitoraggio dei job**
  - **Stato:** confermato sulla VPS: `ALERT_WEBHOOK_URL` e `BACKUP_HEARTBEAT_URL` configurati, avviso e ping provati, controllo esterno del sito attivo.
  - **Problema:** se un timer fallisce non lo sa nessuno. Nessuna unit ha `OnFailure` e non
    c'è un servizio di alert. Il backend non è esposto, quindi `/health` non si raggiunge
    dall'esterno. Gli script di promemoria terminano con successo anche se tutte le email
    falliscono, perché ogni invio ha il suo `.catch` e poi `Promise.allSettled`.
  - **File:** `infra/deploy/systemd/iepf-job@.service`,
    `infra/deploy/systemd/iepf-backup.service`, `infra/deploy/install-timers.sh`,
    `apps/backend/src/scripts/remind-upcoming-lessons.ts`,
    `apps/backend/src/scripts/remind-missing-feedback.ts`,
    `apps/backend/src/scripts/generate-weekly-lessons.ts`
  - **Evidenza:** `Verificato` per l'assenza di `OnFailure`. `Letto nel codice` per l'uscita
    con successo. Corretto il brief: il comportamento è confermato anche in
    `remind-missing-feedback.ts`, e `generate-weekly-lessons.ts` usa lo stesso schema.
  - **Fatto quando:** un job fallito genera un alert provato davvero; una mancata esecuzione
    del backup viene rilevata; gli script escono con codice diverso da zero se gli invii
    falliscono; il sito pubblico ha un controllo esterno di disponibilità.
  - **Attenzione:** tutti i timer hanno `Persistent=false`, quindi una VPS spenta all'ora
    prevista salta l'esecuzione senza errori. `OnFailure` non lo rileva: per il backup serve
    un controllo sull'assenza di esecuzioni (dead man's switch).
  - **Stima:** M
  - **Dipendenze:** nessuna. Il punto 1 ne trae beneficio.

- [x] **6. Fare logout solo su 401 in `proxy.ts`**
  - **Stato:** Corretta anche `app/api/auth/refresh/route.ts`, che cancellava i cookie su ogni errore. Test su proxy e rotte; pagina 503 provata nel browser con backend irraggiungibile: la sessione resta valida.
  - **Problema:** qualsiasi errore del backend (riavvio, 5xx, 429, rete) cancella i cookie e
    disconnette l'utente. Inoltre `refreshWithProfile` ruota il token e poi chiede il
    profilo: se questa seconda chiamata fallisce, i token nuovi vanno persi e quello vecchio
    è già stato cancellato, quindi il logout diventa definitivo.
  - **File:** `apps/frontend/proxy.ts`, `apps/frontend/lib/auth.ts`,
    `apps/frontend/app/api/auth/session/route.ts`, `apps/frontend/proxy.test.ts`
  - **Evidenza:** `Letto nel codice`. `fetchUserProfile` lancia un errore senza stato HTTP e
    il proxy non distingue le cause. `session/route.ts` non cancella i cookie, ma risponde
    `null` su ogni errore e ha lo stesso problema dei token persi.
  - **Fatto quando:** i cookie si cancellano solo su 401 del backend; con un errore
    temporaneo i cookie restano e l'utente vede un errore riprovabile, non il login; i token
    ruotati non vanno persi se fallisce il profilo; `proxy.test.ts` copre 401, 429, 5xx ed
    errore di rete.
  - **Stima:** M
  - **Dipendenze:** nessuna. Da solo non basta: le corse del punto 7 danno comunque 401.

- [x] **7. Rendere atomica la rotazione dei refresh token**
  - **Stato:** Margine di 30 secondi, migrazione `0014`.
  - **Problema:** la rotazione legge, cancella e inserisce in passi separati, senza
    transazione né margine di tolleranza. Con richieste parallele e token scaduto, chi arriva
    dopo la cancellazione riceve 401 e viene disconnesso. Se la risposta si perde dopo la
    rotazione, il risultato è lo stesso.
  - **File:** `apps/backend/src/lib/refresh-tokens.ts`,
    `apps/backend/src/db/schemas/refresh-tokens.schema.ts`
  - **Evidenza:** `Letto nel codice`. Proxy e `app/api/auth/session` ruotano in modo
    indipendente, quindi le richieste parallele sono realistiche.
  - **Fatto quando:** la rotazione è atomica; c'è un breve margine di tolleranza per il token
    appena ruotato; un test con richieste concorrenti non produce logout; un token vecchio
    oltre il margine viene rifiutato.
  - **Stima:** M
  - **PR:** dedicata, per la migrazione se serve una colonna nuova.
  - **Dipendenze:** va coordinato con il punto 6.

- [x] **8. Normalizzare le email con maiuscole**
  - **Stato:** Gli indirizzi che differiscono solo per maiuscole non vengono toccati. **Prima del deploy, sulla VPS:** `docker exec postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select lower(email), count(*) from users group by 1 having count(*) > 1"'`. Se restituisce righe, va scelto a mano quale account tenere.
  - **Problema:** `schoolEmailSchema` non normalizza, quindi gli inviti salvano l'indirizzo
    così com'è, mentre il login lo mette in minuscolo: l'account creato non riesce ad
    accedere. Anche `requestPasswordReset` e `requestEmailVerification` cercano l'indirizzo
    senza normalizzarlo, e in quel caso non parte nessuna email e nessun errore.
  - **File:** `apps/backend/src/db/schemas/users.schema.ts`,
    `apps/backend/src/routes/auth/auth.handlers.ts`,
    `apps/backend/src/lib/admin-invite.ts`, `apps/backend/src/lib/tutor-invite.ts`
  - **Evidenza:** `Letto nel codice`. `register`, `login` e `users.handlers.ts` normalizzano
    già. `users.email` è univoco ma sensibile alle maiuscole. `Da verificare` se esistono già
    dati sporchi, con una query in sola lettura `WHERE email <> lower(email)` su `users` e
    sulle tabelle degli inviti.
  - **Fatto quando:** l'email è normalizzata nello schema condiviso; un test copre invito,
    login, reset e verifica con maiuscole; gli eventuali dati esistenti sono corretti con una
    migrazione che gestisce le collisioni.
  - **Stima:** S (M se ci sono dati da correggere)
  - **Dipendenze:** nessuna

- [x] **9. Rendere transazionali inviti e registrazione**
  - **Stato:** Test anche con un errore reale del database a metà conferma. I controlli `23505` di `users`, `subjects`, `class-sections` e `tutor-subjects` ora usano `lib/db-errors.ts`, che riconosce gli errori incapsulati da Drizzle.
  - **Problema:** l'invito viene consumato prima di validare i dati: una sezione non valida
    o un errore del database lo bruciano. Registrazione e conferma inviti scrivono più
    tabelle senza transazione, quindi possono lasciare un utente senza profilo. Una
    registrazione concorrente può dare 500 invece di 409.
  - **File:** `apps/backend/src/routes/auth/auth.handlers.ts` (`register`,
    `confirmAdminInvite`, `confirmTutorInvite`), `apps/backend/src/lib/admin-invite.ts`,
    `apps/backend/src/lib/tutor-invite.ts`
  - **Evidenza:** `Letto nel codice`. In `auth.handlers.ts` non ci sono `db.transaction` né
    gestione di `23505`, quindi l'errore arriva a `on-error.ts` come 500.
    `users.handlers.ts:59` riconosce già `23505`: quel controllo si può riusare.
  - **Fatto quando:** consumo dell'invito e creazione dell'utente stanno nella stessa
    transazione; con dati non validi l'invito resta valido; un conflitto su email restituisce
    409; test per ciascuno di questi casi.
  - **Stima:** M
  - **Dipendenze:** 8, per gli stessi file e perché il controllo dei duplicati dipende dalla
    normalizzazione.

---

## MEDIA

- [x] **10. Correggere il redirect dopo il login**
  - **Stato:** `lib/safe-redirect.ts`, con test; nel browser `next=//evil.example` porta alla home del ruolo e un `next` interno funziona.
  - **Problema:** il controllo `startsWith('/')` accetta `next=//sito-esterno.com`, quindi un
    link può portare l'utente su un sito esterno subito dopo il login.
  - **File:** `apps/frontend/app/auth/login/page.tsx:111`
  - **Evidenza:** `Letto nel codice`. Riferimento di riga corretto.
  - **Fatto quando:** sono accettati solo percorsi interni; `//host`, `/\host` e URL assoluti
    sono rifiutati; la validazione è in una funzione con test.
  - **Stima:** S
  - **Dipendenze:** nessuna

- [ ] **11. Aggiungere gli header di sicurezza**
  - **Problema:** la home in produzione non invia HSTS, CSP, `X-Frame-Options`,
    `X-Content-Type-Options` né `Referrer-Policy`, ed espone `x-powered-by: Next.js`.
  - **File:** `apps/frontend/next.config.ts`, `infra/deploy/compose.yaml` (etichette Traefik)
  - **Evidenza:** `Verificato` in produzione.
  - **Fatto quando:** `curl -I` in produzione mostra gli header e non più `x-powered-by`
    (`poweredByHeader: false`); la CSP è partita in `report-only` e poi applicata senza
    rompere le pagine.
  - **Stima:** M. La CSP è la parte difficile, per via degli script inline di Next: gli altri
    header possono uscire prima, in una PR separata.
  - **Dipendenze:** 2 e 3, che cambiano `next.config.ts`.

- [ ] **12. Togliere gli indirizzi email dai log**
  - **Problema:** `mailer.ts` registra `envelope`, `accepted` e `rejected`, cioè gli indirizzi
    dei destinatari, a ogni invio.
  - **File:** `apps/backend/src/lib/mailer.ts:52`
  - **Evidenza:** `Letto nel codice`.
  - **Fatto quando:** i log contengono `messageId` ed esito, senza indirizzi. L'anteprima alla
    riga 64 è attiva solo senza `SMTP_HOST` e può restare per lo sviluppo.
  - **Stima:** S
  - **Dipendenze:** nessuna

- [ ] **13. Gestire `SIGTERM` e dare timeout al pool**
  - **Problema:** il backend non gestisce `SIGTERM`, quindi ogni deploy interrompe le
    richieste in corso e le email non ancora inviate. Il pool in `db/index.ts` non ha timeout,
    quindi un database bloccato trattiene le richieste.
  - **File:** `apps/backend/src/index.ts`, `apps/backend/src/db/index.ts`,
    `infra/deploy/compose.yaml`
  - **Evidenza:** `Verificato` per l'assenza nel codice. L'effetto sui deploy non è stato
    osservato.
  - **Fatto quando:** allo spegnimento il server smette di accettare richieste, finisce quelle
    in corso, attende gli invii pendenti e chiude pool e mailer entro un tempo massimo
    inferiore al `stop_grace_period`; il pool ha timeout di connessione e di query.
  - **Attenzione:** le email oggi sono fire-and-forget, quindi per aspettarle bisogna tenere
    traccia delle promise pendenti.
  - **Stima:** S
  - **Dipendenze:** nessuna

- [ ] **14. Aggiungere gli indici mancanti**
  - **Problema:** mancano indici su `refresh_tokens.token_hash`, `lessons.start_at`,
    `lessons.tutor_id`, `lesson_bookings.student_id`, `token_ledger.student_id` e
    `audit_logs.created_at`.
  - **File:** `apps/backend/src/db/schemas/` (schemi delle tabelle indicate), nuova migrazione
    in `apps/backend/src/db/migrations/`
  - **Evidenza:** `Verificato`: nessun `CREATE INDEX` non univoco nelle migrazioni. L'indice
    univoco di `lesson_bookings` inizia da `lesson_id` e non aiuta su `student_id`.
    L'impatto sulle prestazioni non è stato misurato.
  - **Fatto quando:** gli indici esistono in schema e migrazione, e le query principali li
    usano secondo `EXPLAIN`. `token_hash` conviene che sia **univoco**, a differenza degli
    altri: va controllato prima che non ci siano duplicati.
  - **Attenzione:** un `CREATE INDEX` normale blocca le scritture e `audit_logs` può essere
    grande. Controllare le dimensioni prima del deploy e valutare `CONCURRENTLY`, che però non
    gira dentro una transazione.
  - **Stima:** S
  - **PR:** dedicata (migrazione).
  - **Dipendenze:** nessuna

- [ ] **15. Definire la conservazione dei dati**
  - **Problema:** `audit_logs` cresce senza limiti, con una riga per richiesta (escluso
    `/health`) che contiene IP e user agent. I token scaduti non vengono mai cancellati, salvo
    quando qualcuno prova a usarli.
  - **File:** `apps/backend/src/middlewares/audit-logger.ts`, nuovo script in
    `apps/backend/src/scripts/`, `infra/deploy/job.sh`, `infra/deploy/systemd/`,
    `infra/deploy/install-timers.sh`
  - **Evidenza:** `Verificato`: nessuno script di pulizia presente.
  - **Fatto quando:** la durata di conservazione è decisa e scritta; un job periodico cancella
    log e token scaduti (refresh, reset password, verifica email, inviti); il job è coperto
    dal monitoraggio.
  - **Decisione richiesta:** la durata di conservazione dei log. Coinvolge dati personali di
    studenti, quindi va concordata con chi ne è responsabile per la scuola.
  - **Stima:** M
  - **Dipendenze:** 14 (`audit_logs.created_at`), 5

- [ ] **16. Paginare la lista lezioni nel database**
  - **Problema:** la lista carica tutte le lezioni in memoria, calcola i campi e solo alla fine
    applica `slice`.
  - **File:** `apps/backend/src/routes/lessons/lessons.handlers.ts:330` e `:407`
  - **Evidenza:** `Letto nel codice`. L'impatto non è stato misurato.
  - **Fatto quando:** `LIMIT` e `OFFSET` sono nella query, `total` viene da un conteggio, e i
    test confermano che risposta e ordinamento non cambiano.
  - **Stima:** M
  - **Dipendenze:** 14

- [ ] **17. Correggere il matcher del proxy e i link email**
  - **Problema:** il matcher fa passare anche gli asset di `public/`. I link email sotto `/auth`
    reindirizzano gli utenti già autenticati, quindi chi è connesso non riesce ad aprire il
    link di reset password.
  - **File:** `apps/frontend/proxy.ts`, `apps/frontend/proxy.test.ts`
  - **Evidenza:** `Letto nel codice`. Precisazione: la chiamata al backend e la riga di audit
    per ogni asset si verificano solo con il cookie di accesso presente, non per i visitatori
    anonimi.
  - **Fatto quando:** gli asset non attivano il proxy; `/auth/reset-password` e
    `/auth/verify-email` si aprono anche da autenticati (da controllare anche `sign-up-admin` e
    `sign-up-tutor`, usate dagli inviti); test aggiunti.
  - **Stima:** S
  - **Dipendenze:** 6 (stesso file)

- [ ] **18. Aggiungere `error.tsx` e `loading.tsx`**
  - **Problema:** il frontend ha solo `app/not-found.tsx`: un errore di rendering mostra la
    pagina predefinita di Next e la navigazione non ha stati di caricamento.
  - **File:** `apps/frontend/app/` (`error.tsx`, `global-error.tsx`, `loading.tsx`)
  - **Evidenza:** `Verificato`.
  - **Fatto quando:** i file esistono almeno alla radice e nelle aree principali, in italiano,
    con un'azione per riprovare; un errore provocato di proposito mostra la nuova pagina.
  - **Stima:** S
  - **Dipendenze:** nessuna. Coordinare con il punto 6 la pagina di errore temporaneo.

- [ ] **19. Valutare una coda email su database**
  - **Problema:** le email fire-and-forget si perdono a ogni riavvio, compresi reset password e
    inviti. I promemoria non hanno protezione da invii doppi: rilanciare un job rimanda tutto.
  - **File:** `apps/backend/src/lib/mailer.ts`, `apps/backend/src/routes/auth/auth.handlers.ts`,
    `apps/backend/src/routes/users/users.handlers.ts`,
    `apps/backend/src/routes/lessons/lessons.handlers.ts`, `apps/backend/src/scripts/remind-*.ts`
  - **Evidenza:** `Letto nel codice`. Perdite e doppi invii non sono stati osservati.
  - **Fatto quando:** c'è una decisione scritta, coda oppure no. Se sì: le email sono salvate
    nella stessa transazione dell'azione, inviate con tentativi ripetuti e senza doppi invii;
    gli invii falliti in modo definitivo generano un alert.
  - **Stima:** L
  - **PR:** dedicata (migrazione e modifica trasversale).
  - **Dipendenze:** 9, 13, 5

---

## MANUTENZIONE

- [ ] **20. Rafforzare CI e deploy**
  - **Problema:** `main` non è protetto, le action sono fissate per tag e non per SHA, e l'utente
    SSH di deploy è root.
  - **File:** `.github/workflows/ci-release.yml`, `infra/deploy/README.md:68`,
    `infra/deploy/bootstrap.sh`
  - **Evidenza:** `Verificato` per la protezione (l'API di GitHub risponde 403: serve un piano a
    pagamento su repo privata) e per le action. Root risulta dal README. `Da verificare`
    `TRAEFIK_IMAGE` in `/opt/iepf/shared/host.env` sulla VPS: `traefik:latest` in
    `ci-release.yml:132` serve solo a validare il Compose, e `host.env.example` prevede un
    digest.
  - **Fatto quando:** le action sono fissate per SHA e aggiornate dal punto 4; il deploy usa un
    utente dedicato con permessi limitati (l'appartenenza al gruppo `docker` equivale di fatto a
    root, quindi non basta); `TRAEFIK_IMAGE` è fissata per digest; per `main` c'è una decisione
    scritta, tra un piano a pagamento e il rischio accettato.
  - **Stima:** M
  - **PR:** dedicata per il cambio di utente di deploy: può rompere il deploy stesso.
  - **Dipendenze:** 4

- [ ] **21. Pulire file e configurazioni legacy**
  - **Problema:** restano file e impostazioni non più usati.
    - `infra/deploy.sh`, `infra/backup-postgres.sh`, `infra/docker-compose.yml`
    - `infra/.env.backend.example`, `infra/.env.frontend.example`, `infra/.env.postgres.example`
    - `apps/frontend/build-frontend.sh`, `apps/backend/build-backend.sh`
    - titolo `Tasks API` in `apps/backend/src/lib/configure-open-api.ts:13`
    - `next` dichiarato 16.1.1 ma forzato alla 16.1.6, `eslint-config-next` da allineare
    - `@types/node` a 20 (frontend) e 24 (backend), con Node 22
    - `AppType` in `apps/backend/src/app.ts:49`, definito ma mai importato
  - **Evidenza:** `Verificato` con `git grep`: nessun riferimento a questi file, salvo
    `infra/deploy.sh` che usa `infra/docker-compose.yml`.
  - **Fatto quando:** i file sono rimossi; il titolo API è corretto; `@types/node` è alla 22 in
    entrambe le app; CI e build passano. Le versioni di `next` ed `eslint-config-next` si chiudono
    col punto 3. Tenere `AppType` solo se il punto 23 lo usa.
  - **Attenzione:** `backup-postgres.sh` in `infra/deploy/install-timers.sh:15` è il nome usato per
    disattivare i vecchi cron: quella stringa non va toccata. `apps/frontend/.env.development.example`
    non ha riferimenti, ma descrive lo sviluppo locale: controllare se è ancora utile.
  - **Stima:** S
  - **Dipendenze:** 3

- [ ] **22. Aggiungere test end-to-end**
  - **Problema:** ci sono 6 file di test, tutti unitari o di integrazione, e nessun test
    end-to-end né di componente.
  - **File:** nuova configurazione Playwright, `.github/workflows/ci-release.yml`
  - **Evidenza:** `Verificato`.
  - **Fatto quando:** Playwright copre login, prenotazione e cancellazione sullo stack locale con
    i dati di `dev-seed`, e gira in CI.
  - **Stima:** M
  - **Dipendenze:** 3

- [ ] **23. Generare un contratto API condiviso**
  - **Problema:** `apps/frontend/api-doc.json` è statico (citato solo da `CODEBASE.md`) e le rotte
    `app/api` indovinano il formato delle risposte, come fa `LESSON_LIST_KEYS` in
    `app/api/lessons/route.ts`.
  - **File:** `apps/frontend/api-doc.json`, `apps/frontend/app/api/`,
    `apps/frontend/lib/backend-response.ts`, `apps/backend/src/lib/configure-open-api.ts`
  - **Evidenza:** `Verificato` per la staticità e per il codice citato.
  - **Fatto quando:** i tipi sono generati dall'OpenAPI del backend; la CI fallisce se non sono
    allineati; `api-doc.json` è rimosso o generato; le rotte principali non indovinano più il
    formato.
  - **Stima:** L
  - **Dipendenze:** 21 (titolo API e `AppType`)

- [ ] **24. Spezzare i file enormi**
  - **Problema:** file troppo grandi da rivedere e modificare con sicurezza:
    `apps/frontend/components/admin-stats-page.tsx` (2412 righe),
    `apps/frontend/components/admin-lesson-details-page.tsx` (2076),
    `apps/backend/src/routes/lessons/lessons.handlers.ts` (1884).
  - **Evidenza:** `Verificato` con `wc -l`.
  - **Fatto quando:** ogni file è diviso per responsabilità, senza cambi di comportamento e con i
    test verdi.
  - **Stima:** L
  - **PR:** dedicata, una per file. Non mescolare con correzioni funzionali.
  - **Dipendenze:** 22, 16 (stesso handler), 23 consigliato

- [ ] **25. Valutare TanStack Query per il caricamento dati**
  - **Problema:** il frontend carica i dati con `useEffect` e `fetch` manuali, ripetendo stati di
    caricamento, errori e aggiornamenti.
  - **File:** `apps/frontend/components/`, `apps/frontend/app/`
  - **Evidenza:** `Verificato`, con una correzione: oggi conto **31 file** con `useEffect` e
    `fetch(` in `app`, `components` e `lib`, non 37 (i file con `useEffect` sono 39).
  - **Fatto quando:** c'è una decisione scritta, provata su una pagina pilota. Se positiva, la
    migrazione procede a piccole PR.
  - **Stima:** L (S per la sola valutazione)
  - **Dipendenze:** 22, 23, 24

---

## Corrispondenza con la lista iniziale

| Iniziale | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Piano** | 3 | 4 | 2 | 6 | 7 | 9 | 8 | 5 | 1 | 11 | 10 | 13 | 19 | 12 | 15 | 14 | 16 | 18 | 17 | 23 | 24 | 25 | 22 | 21 | 20 |
