# Repository e identità

Il codice vive nella monorepo `ITI-P-Hensemberger/iepf`; le immagini restano
`ghcr.io/iti-p-hensemberger/iepf-backend` e `iepf-frontend`, gli unici nomi accettati
da `apply.sh`. I workflow usano `GITHUB_TOKEN` della repository e `github.actor` per
il login GHCR: entrambi i package devono concedere alla monorepo il ruolo Write.

Il trasferimento delle repository non va confuso con la migrazione delle immagini
esistenti. `bootstrap.sh` rileva i digest dei container attualmente in esecuzione e
ricava da quello del backend il riferimento all'immagine `migrate` già presente.
È possibile specificarla esplicitamente come secondo argomento:

```bash
bash bootstrap.sh /opt/infra/iepf ghcr.io/iti-p-hensemberger/iepf-backend:tools-COMMIT_SHA
```

Durante la transizione sono ammessi i digest esatti salvati nel file iniziale
`/opt/iepf/shared/images.env`, anche se provengono dal precedente namespace.
Ogni nuova richiesta di deploy deve invece riferirsi a immagini del nuovo
namespace. Le immagini precedenti devono rimanere accessibili sulla VPS e nel
registry finché sono necessarie al primo avvio o a un rollback.

# Deploy operativo

Il workflow unico `.github/workflows/ci-release.yml` decide cosa fare con
`infra/ci/changes.py`, unica sorgente dei filtri per percorso:

| Modifica | Controlli | Rilascio |
| --- | --- | --- |
| `apps/backend/**` | backend | backend |
| `apps/frontend/**` | frontend | frontend |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc`, `.dockerignore` | entrambe le app | entrambe le app |
| file del bundle in `infra/deploy/` (`compose.yaml`, `apply.sh`, `job.sh`, `backup.sh`, `alert.sh`, `install-timers.sh`, `systemd/`) | infra | infra |
| `.github/workflows/**`, `infra/ci/**` | tutti | infra |
| resto di `infra/`, `.github/`, `Makefile` | infra | nessuno |
| file `.md` | quelli dell'app | nessuno |

Su `main` i controlli infra girano sempre, perché ogni deploy li presuppone. Una push
senza base affidabile (primo push o force push) conta come modifica di tutto.
Il backend esegue typecheck, lint, build, migrazioni e test; il frontend typecheck,
lint, test e build, con lockfile frozen. Vengono poi pubblicate immagini linux/amd64
identificate dal commit, trasferito un bundle via SSH e attivato.

Il job `deploy` richiede la variabile `DEPLOY_ENABLED=true`: senza, le immagini vengono
pubblicate ma nulla va in produzione. Se un controllo o una build fallisce non si
rilascia nessun componente di quel commit. Quando un commit cambia entrambe le app si
applica un bundle per componente, prima il backend e poi il frontend, e ci si ferma al
primo errore. Ogni bundle contiene già i file di deploy dalla punta di `main`, quindi
il rilascio `infra` separato parte solo se nessuna app viene rilasciata.

Una build più vecchia salta il deploy di un componente solo se un commit successivo su
`main` rilascia quello stesso componente. Se un deploy fallisce e i commit successivi
non toccano quel componente, rilanciare il run fallito oppure usare `workflow_dispatch`
con `component=backend` o `frontend` senza immagine: ricostruisce da `main` e rilascia.

La coda GitHub (`queue: max`) e il lock sulla VPS
impediscono deploy e job concorrenti sul database. Non viene effettuato alcun
checkout Git sul server. Sul piano Free con repo private si usano secret di
repository; il workflow non richiede GitHub Environments.

La VPS usa `/opt/iepf/releases/<release-id>` e il link `current`. L'ID è
`<run-id>-<attempt><slot>`, con slot 1 backend, 2 frontend, 3 infra, 4 rollback: un run
può attivare più componenti e `apply.sh` rifiuta un ID già esistente. Il tentativo 1 del
backend nel run 123 è quindi `123-11`. Le release create prima della monorepo conservano
l'ID `<run-id>-<attempt>` e restano valide per il rollback. I file in
`shared` contengono configurazione, credenziali e backup: non sono versionati né
inclusi nei bundle. I bind mount PostgreSQL e ACME sono rilevati dal bootstrap e
rimangono nei percorsi esistenti. L'utente SSH configurato è root, con una chiave
dedicata a Actions e opzione `restrict` nell'authorized_keys; questo accesso ha
privilegi amministrativi sul server.

Secret della monorepo: `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`.
Variabili della monorepo: `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `DEPLOY_ENABLED`.
Il login GHCR per il pull è configurato direttamente sulla VPS con un token
classic `read:packages`. Il token di login personale `gh` non viene copiato nei
secret o sul server.

Prima attivazione:

1. Eseguire `bootstrap.sh` sulla VPS: rileva immagini e percorsi, copia i file env,
   salva il crontab; non riavvia servizi.
2. Eseguire `backup.sh` e verificare l'upload su Drive.
3. Pubblicare la repo: la prima attivazione infra attiva le versioni esistenti con i
   controlli di salute. La prima attivazione infra non esegue migrazioni.
4. Dopo il successo eseguire `bash /opt/iepf/current/install-timers.sh` sulla VPS: installa i timer e
   rimuove solo i vecchi cron IEPF. Gli orari sono in Europe/Rome: backup 02:00,
   pulizia dati 03:30, riepilogo admin 08:00, reminder lezioni oggi 12:00, domani 20:30,
   feedback 17:00, presenze non segnate ogni 5 minuti dalle 08:00 alle 20:55 (lun-sab);
   generazione lezioni sabato 12:00. Non recupera automaticamente gli invii persi dopo un downtime.
5. Rilasciare backend e frontend: le build e i successivi deploy sono automatici.

Le immagini di manutenzione sono costruite dallo stesso commit del backend e
usate per migrazioni e job, con gli script package.json e i flag `--today`/`--tomorrow` inoltrati.
Prima di ogni cambio dell'immagine di manutenzione si esegue un backup locale e
su Drive. Un errore di backup o migrazione blocca l'attivazione delle nuove
immagini. I backup locali hanno retention 7 giorni, quelli su Drive 30 giorni.

Un errore nell'attivazione o nello smoke test pubblico tenta di ripristinare la
release applicativa precedente e lascia il workflow in errore. Le migrazioni del
database non vengono annullate. La prima attivazione non dispone ancora di una
release gestita precedente; il cutover deve essere seguito da un operatore.
Questo stack Compose può avere un breve downtime durante la ricreazione dei
container, non implementa un deploy blue/green.

Rollback da GitHub: avviare manualmente `CI and release` da `main`, scegliere
`component=rollback` e indicare un ID presente in `/opt/iepf/releases`. Vengono
ripristinati i digest e la configurazione di quella release; non si eseguono
migrazioni inverse. Verificare la compatibilità con lo schema attuale prima di
scegliere una release precedente. Le cartelle delle release restano (pochi KB l'una). Dopo ogni attivazione
riuscita `apply.sh` cancella le immagini delle app che la release attiva non usa: un
rollback riscarica da GHCR le immagini della release scelta, per digest. Le immagini su
GHCR non vanno quindi cancellate finché le release che le usano possono servire.

Monitoraggio: un timer fallito attiva `iepf-alert@.service`, che manda un POST di testo
a `ALERT_WEBHOOK_URL`; dopo ogni backup riuscito `backup.sh` chiama
`BACKUP_HEARTBEAT_URL`, così un backup mai partito si nota dal ping mancante. Entrambe
stanno in `/opt/iepf/shared/host.env` e sono facoltative: senza URL l'errore resta solo
nel journal. La disponibilità del sito va controllata da un servizio esterno su
`https://iepf.hensemberger.it/auth/login`, perché il backend non è esposto. Per provare
l'avviso: `systemctl start iepf-alert@prova.service`. `install-timers.sh` copia lo script in
`/opt/iepf/shared/alert.sh`, così funziona anche dopo un rollback: rieseguirlo se lo script cambia.

Cifratura: il dump del database (`iepf-*.sql.gz.gpg`) e la configurazione sono cifrati con
la passphrase di `/opt/iepf/shared/backup.key`. I dump in chiaro (`*.sql.gz`) fatti prima
della cifratura restano su Drive fino alla scadenza dei 30 giorni.

Backup della configurazione: ogni backup salva anche `host.env`, `backend.env`,
`postgres.env` e `images.env` (chiavi VAPID, SMTP, segreto JWT) in
`gdrive:postgres-backups/config`.
La stessa passphrase va tenuta fuori dal server (password manager): senza, su una VPS nuova
l'archivio non si apre. Senza il file il backup fallisce, e con lui il deploy che migra.
Ripristino su una VPS nuova, dopo aver configurato rclone:

```bash
rclone copy gdrive:postgres-backups/config/FILE.tar.gz.gpg .
gpg --batch --pinentry-mode loopback --passphrase-file backup.key -d FILE.tar.gz.gpg | tar -xzf - -C /opt/iepf/shared
```

Controllo di salute: ogni ora ai :17 `iepf-health` controlla disco (80%), RAM disponibile
(300 MB), swap (90%), stato dei container, servizi systemd in errore, scadenza del
certificato TLS (14 giorni) ed errori del kernel dell'ultima ora (task bloccati, `qxl`, OOM).
Manda un messaggio a `ALERT_WEBHOOK_URL` solo quando l'elenco dei problemi cambia, e uno
quando tutto torna a posto; l'ultimo elenco sta in `shared/health.last`. Se la VPS è giù non
può avvisare: per quello serve il monitoraggio esterno (UptimeRobot), che va collegato a
ntfy anche dal suo lato. A mano: `systemctl start iepf-health.service`.

Prova di ripristino: la prima domenica del mese alle 05:30 `iepf-restore-test` carica
l'ultimo backup locale in un PostgreSQL temporaneo senza rete e controlla che `users` abbia
righe; se fallisce arriva l'avviso. A mano: `systemctl start iepf-restore-test.service`.

Ripristino da Drive provato il 2026-11-09: il dump cifrato delle 02:23 (4,2 MB), scaricato con
`ssh iepf 'rclone cat gdrive:postgres-backups/FILE' > FILE` e decifrato fuori dalla VPS con la
passphrase del gestore password, si carica in meno di un secondo in un PostgreSQL 16 temporaneo
senza rete (stessa immagine della produzione). 26 tabelle su 31 avevano gli stessi conteggi della
produzione; le altre 5 differivano solo per il lavoro di `cleanup-data` delle 03:30 e per
l'attività successiva (analytics, audit, token). Dump e container sono stati cancellati dopo la prova.

Server: `host-setup.sh` applica la configurazione che il bundle non porta, ed è
rieseguibile. SSH solo con chiave (root compreso, che usa il deploy), journal massimo
500 MB, log dei container limitati, logrotate senza la doppia regola di cloud-init,
driver video virtuale `qxl` disattivato (dopo qualche giorno si guasta e blocca lo
spegnimento: è successo il 9/11), aggiornamenti Ubuntu completi (kernel compreso) alle 04:00, dopo backup e pulizia, con
riavvio alle 04:30 se serve. Da eseguire su una VPS nuova e a ogni modifica:
`ssh iepf 'bash -s' < infra/deploy/host-setup.sh`.

Conservazione: ogni notte `iepf-job@cleanup-data` cancella gli `audit_logs` più vecchi di
90 giorni, i token e gli inviti scaduti e le iscrizioni push silenziose da 120 giorni
(`apps/backend/src/lib/data-retention.ts`).

Diagnostica: `systemctl list-timers 'iepf-*'`,
`journalctl -u iepf-job@remind-lessons-today`,
`journalctl -u iepf-backup`, e `readlink -f /opt/iepf/current`.
Il percorso operativo automatico è `deploy/`.

Il probe backend interroga `/health`, pubblico e con verifica del database. Le
immagini precedenti rispondono 401 su quella rotta: solo in quel caso il probe
ricade su `/doc`, così deploy e rollback non dipendono dall'ordine di rilascio. Il probe
frontend usa l'hostname del container per supportare anche il binding delle
vecchie immagini standalone. La disponibilità PostgreSQL viene controllata
separatamente con `pg_isready`. Il probe HTTP non sostituisce un test funzionale
completo delle operazioni applicative.

## Notifiche push

Le push sono spente finché `/opt/iepf/shared/backend.env` non contiene le chiavi VAPID.
Il backend parte anche senza, e le email non cambiano. Per attivarle, una sola volta:

Dopo il primo deploy del backend che contiene le push, sulla VPS:

```bash
cd /opt/iepf/current
alias iepf-compose='docker compose --env-file /opt/iepf/shared/host.env --env-file images.env -f compose.yaml'
iepf-compose run --rm --no-deps maintenance npm run push:vapid-keys
```

1. Aggiungere a `/opt/iepf/shared/backend.env` le due righe stampate e
   `VAPID_SUBJECT=mailto:iepf@hensemberger.it`, un contatto per i servizi push. Deve
   essere un dominio reale: Apple rifiuta ogni invio (403 `BadJwtToken`) con domini
   come `example.test`, e il backend non parte con un valore del genere.
   Così la chiave privata non lascia mai il server.
2. Ricreare il backend perché rilegga il file:
   `iepf-compose up -d --force-recreate --wait backend`. I job dei timer leggono il file
   a ogni avvio.
3. Dal profilo di un account studente o tutor, attivare le notifiche su un dispositivo,
   poi mandare una notifica di prova:
   `iepf-compose run --rm --no-deps maintenance npm run push:test -- EMAIL`.

Le chiavi non vanno cambiate né perse: la chiave privata sta solo in `shared` e nei
backup del server. Se cambiano, ogni dispositivo smette di ricevere in silenzio finché
l'utente non riattiva le notifiche dal profilo. Una chiave privata esposta si sostituisce
come sopra, accettando quella perdita.

Avvisi agli admin attivi, per push e per email secondo le preferenze di ciascuno:
feedback con voto 2 o meno, annullamenti dello studente nel giorno della lezione e assenze
arrivano subito; la settimana senza lezioni arriva dal job del sabato, ma non se tutti i
giorni da lunedì a venerdì sono di chiusura; admin in attesa di attivazione e richieste di
materie delle ultime 24 ore arrivano dal riepilogo delle 08:00 (`iepf-job@notify-admins`).
Un admin disattivato a mano non conta come in attesa. Dopo il deploy che introduce il
riepilogo, rieseguire `install-timers.sh` per installare il nuovo timer.

Presenze non segnate (`iepf-job@remind-presence`, ogni 5 minuti): 20 minuti dopo l'inizio
di una lezione con studenti ancora né presenti né assenti, il tutor riceve un promemoria
e gli admin un avviso, una volta sola per lezione. Dopo il deploy che lo introduce,
rieseguire `install-timers.sh`.

Ogni invio fallito con 404 o 410 elimina il dispositivo; gli altri errori finiscono nel
log senza far fallire i job, perché l'email resta il canale di riferimento. La pulizia
notturna elimina i dispositivi silenziosi da 120 giorni. I promemoria registrano la push
in `reminder_deliveries` con la chiave `push:` più quella dell'email, così un job
rilanciato non la manda due volte.

## Reset dell'anno scolastico

Il reset dalle impostazioni admin elimina studenti, tutor, lezioni, prenotazioni,
feedback, movimenti token e inviti tutor. Richiede la password dell'admin e non è
consentito in impersonazione. Non esiste annullamento: si può recuperare solo da
un backup, quindi prima di confermarlo eseguire sulla VPS:

```bash
bash /opt/iepf/current/backup.sh
ls -lt /opt/iepf/shared/backups | head -3
```

Ripristino, con applicazioni ferme e dopo aver verificato il file scelto. Sostituisce
il contenuto del database, quindi va provato prima su una copia:

```bash
docker compose --env-file /opt/iepf/shared/host.env --env-file /opt/iepf/current/images.env -f /opt/iepf/current/compose.yaml stop frontend backend
docker exec postgres sh -ec 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
gpg --batch --pinentry-mode loopback --passphrase-file /opt/iepf/shared/backup.key -d FILE.sql.gz.gpg | gunzip -c | docker exec -i postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
docker compose --env-file /opt/iepf/shared/host.env --env-file /opt/iepf/current/images.env -f /opt/iepf/current/compose.yaml up -d --wait frontend backend
```

Le modifiche alla sola documentazione non attivano un deploy; su `main` vengono
comunque eseguiti i controlli infrastrutturali. La configurazione dei timer installata in
`/etc/systemd/system` si aggiorna rieseguendo `bash /opt/iepf/current/install-timers.sh` dopo un deploy
che modifica `deploy/systemd/`.

Al termine del cutover i vecchi script, Compose e file env sono stati archiviati
in `/opt/iepf/shared/legacy/`, accessibile solo a root. La directory
`/opt/infra/iepf/` conserva esclusivamente i bind mount `postgres-data` e
`letsencrypt`; `/root/iepf` è un collegamento a questa directory. Non cancellare
questi percorsi finché i bind mount non vengono migrati esplicitamente. Il server
esegue le release sotto `/opt/iepf/` senza checkout delle repository.
