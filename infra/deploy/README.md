# Repository e identità dopo il trasferimento

Le repository sono `ITI-P-Hensemberger/iepf-backend`,
`ITI-P-Hensemberger/iepf-frontend` e `ITI-P-Hensemberger/iepf-infra`.
Le nuove immagini vengono pubblicate sotto `ghcr.io/iti-p-hensemberger/`.

`jdncst-dev` è Owner dell'organizzazione e Admin delle repository: non occorre
cambiare l'autore dei commit o autenticarsi come proprietario delle repository.
I workflow usano `GITHUB_TOKEN` della repository e `github.actor` per il login
GHCR. Il secret `INFRA_DISPATCH_TOKEN` deve avere accesso alla nuova repository
`ITI-P-Hensemberger/iepf-infra`, con permesso Contents: write per repository_dispatch.

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

I push su `main` di frontend e backend eseguono typecheck, lint e build con npm,
pubblicano immagini linux/amd64 identificate dal commit e notificano i digest
alla pipeline centrale di infra. La pipeline infra esegue i controlli, trasferisce
un bundle via SSH e lo attiva. La coda GitHub (`queue: max`) e il lock sulla VPS
impediscono deploy e job concorrenti sul database. Non viene effettuato alcun
checkout Git sul server. Sul piano Free con repo private si usano secret di
repository; il workflow non richiede GitHub Environments.

La VPS usa `/opt/iepf/releases/<run-id>-<attempt>` e il link `current`. I file in
`shared` contengono configurazione, credenziali e backup: non sono versionati né
inclusi nei bundle. I bind mount PostgreSQL e ACME sono rilevati dal bootstrap e
rimangono nei percorsi esistenti. L'utente SSH configurato è root, con una chiave
dedicata a Actions e opzione `restrict` nell'authorized_keys; questo accesso ha
privilegi amministrativi sul server.

Secret di infra: `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`.
Variabili di infra: `VPS_HOST`, `VPS_USER`, `VPS_PORT`.
Il login GHCR per il pull è configurato direttamente sulla VPS con un token
classic `read:packages`. Il token di login personale `gh` non viene copiato nei
secret o sul server.

Prima attivazione:

1. Eseguire `bootstrap.sh` sulla VPS: rileva immagini e percorsi, copia i file env,
   salva il crontab; non riavvia servizi.
2. Eseguire `backup.sh` e verificare l'upload su Drive.
3. Pubblicare la repo infra: il primo push attiva le versioni esistenti con i
   controlli di salute. La prima attivazione infra non esegue migrazioni.
4. Dopo il successo eseguire `install-timers.sh` sulla VPS: installa i timer e
   rimuove solo i vecchi cron IEPF. Gli orari sono in Europe/Rome: backup 02:00,
   reminder lezioni oggi 12:00, domani 20:30, feedback 17:00; generazione lezioni
   sabato 12:00. Non recupera automaticamente gli invii persi dopo un downtime.
5. Pubblicare backend e frontend: le build e i successivi deploy sono automatici.

Le immagini di manutenzione sono costruite dallo stesso commit del backend e
usate per migrazioni e job, con npm e i flag `--today`/`--tomorrow` inoltrati.
Prima di ogni cambio dell'immagine di manutenzione si esegue un backup locale e
su Drive. Un errore di backup o migrazione blocca l'attivazione delle nuove
immagini. I backup locali hanno retention 7 giorni, quelli su Drive 30 giorni.

Un errore nell'attivazione o nello smoke test pubblico tenta di ripristinare la
release applicativa precedente e lascia il workflow in errore. Le migrazioni del
database non vengono annullate. La prima attivazione non dispone ancora di una
release gestita precedente; il cutover deve essere seguito da un operatore.
Questo stack Compose può avere un breve downtime durante la ricreazione dei
container, non implementa un deploy blue/green.

Rollback da GitHub: avviare manualmente `Production deploy`, scegliere
`component=rollback` e indicare un ID presente in `/opt/iepf/releases`. Vengono
ripristinati i digest e la configurazione di quella release; non si eseguono
migrazioni inverse. Verificare la compatibilità con lo schema attuale prima di
scegliere una release precedente. Le release vengono conservate finché utili
per recupero e diagnosi; non è previsto cleanup automatico delle immagini Docker.

Diagnostica: `systemctl list-timers 'iepf-*'`,
`journalctl -u iepf-job@remind-lessons-today`,
`journalctl -u iepf-backup`, e `readlink -f /opt/iepf/current`.
Gli script di build e il vecchio Compose nella radice rimangono per consultazione;
il percorso operativo automatico è `deploy/`.
