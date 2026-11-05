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
   pulizia dati 03:30, reminder lezioni oggi 12:00, domani 20:30, feedback 17:00;
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
scegliere una release precedente. Le release vengono conservate finché utili
per recupero e diagnosi; non è previsto cleanup automatico delle immagini Docker.

Monitoraggio: un timer fallito attiva `iepf-alert@.service`, che manda un POST di testo
a `ALERT_WEBHOOK_URL`; dopo ogni backup riuscito `backup.sh` chiama
`BACKUP_HEARTBEAT_URL`, così un backup mai partito si nota dal ping mancante. Entrambe
stanno in `/opt/iepf/shared/host.env` e sono facoltative: senza URL l'errore resta solo
nel journal. La disponibilità del sito va controllata da un servizio esterno su
`https://iepf.hensemberger.it/auth/login`, perché il backend non è esposto. Per provare
l'avviso: `systemctl start iepf-alert@prova.service`. `install-timers.sh` copia lo script in
`/opt/iepf/shared/alert.sh`, così funziona anche dopo un rollback: rieseguirlo se lo script cambia.

Conservazione: ogni notte `iepf-job@cleanup-data` cancella gli `audit_logs` più vecchi di
90 giorni e i token e gli inviti scaduti (`apps/backend/src/lib/data-retention.ts`).

Diagnostica: `systemctl list-timers 'iepf-*'`,
`journalctl -u iepf-job@remind-lessons-today`,
`journalctl -u iepf-backup`, e `readlink -f /opt/iepf/current`.
Gli script di build e il vecchio Compose nella radice rimangono per consultazione;
il percorso operativo automatico è `deploy/`.

Il probe backend interroga `/health`, pubblico e con verifica del database. Le
immagini precedenti rispondono 401 su quella rotta: solo in quel caso il probe
ricade su `/doc`, così deploy e rollback non dipendono dall'ordine di rilascio. Il probe
frontend usa l'hostname del container per supportare anche il binding delle
vecchie immagini standalone. La disponibilità PostgreSQL viene controllata
separatamente con `pg_isready`. Il probe HTTP non sostituisce un test funzionale
completo delle operazioni applicative.

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
gunzip -c FILE.sql.gz | docker exec -i postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
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
