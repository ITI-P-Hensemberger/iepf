# IEPF

Monorepo pnpm della piattaforma IEPF:

```text
apps/backend/    API Hono, Drizzle
apps/frontend/   Next.js 16
infra/           Compose, deploy su VPS, launcher locale, script CI
```

Il lockfile è uno solo, `pnpm-lock.yaml` nella radice. La migrazione dalle tre
repository precedenti è descritta in [docs/cutover.md](docs/cutover.md).

## Sviluppo locale

Requisiti: macOS o Linux, Python 3.9+, make, Docker con Compose e Node 22 con npm.
Lo script usa Node 22 dal PATH o da un'installazione nvm già presente. Se manca:
`nvm install 22`. pnpm 10.28.2 viene invocato tramite npx: non serve installarlo
globalmente. La prima installazione richiede accesso al registry npm.

Dalla radice della repository:

```bash
make setup       # installa dipendenze frozen e prepara gli env locali
make dev         # database e Mailpit, migrazioni, entrambe le app con hot reload
```

Aprire il frontend su http://localhost:3000, l'API su http://localhost:9999/doc
e le email su http://localhost:8025. I log applicativi rimangono nel terminale;
`make logs` mostra quelli dei servizi Docker. Ctrl+C arresta entrambe le app,
lasciando PostgreSQL e Mailpit disponibili. `make stop` arresta anche Docker.

Gli env gestiti sono in `.local/`, esclusa da Git, con permessi riservati.
Il setup non sovrascrive file esistenti e non modifica i `.env` delle app.
`make dev` passa alle applicazioni la propria configurazione esplicita, incluso
il fuso Europe/Rome, senza usare credenziali SMTP o database di produzione.
Il backend supporta `ENV_FILE` e dà precedenza alle variabili del processo.

Entrambe le app usano pnpm 10.28.2 e `pnpm-lock.yaml` nella radice come unico
lockfile. Non usare npm install per aggiungere dipendenze: dalla radice eseguire
`pnpm --filter iepf-backend add PACCHETTO` (o `iepf-frontend`) e committare il lockfile.

## Dati demo e database

```bash
make seed                     # campione minimo, senza inviare email
make seed-full                # intera catena mock esistente, con email su Mailpit
make db-generate              # genera i file SQL dopo una modifica agli schemi
make db-migrate               # applica le migrazioni versionate
make db-reset CONFIRM=yes      # ricrea SOLO iepf_dev e ricarica i dati demo
make db-clear CONFIRM=yes      # ricrea SOLO iepf_dev vuoto, senza seed
```

Account demo: `admin@example.test`, `activator@example.test`,
`tutor@example.test`, `student@example.test`. Password: `LocalDemo123!`.
Gli account sono verificati e attivi. Il seed include una materia, una sezione,
disponibilità tutor, due lezioni, una prenotazione e relativi movimenti token.
È ripetibile e non reimposta password, nomi o profili già modificati.
Le date delle lezioni vengono fissate alla prima creazione: per ricreare il
campione con nuove date utilizzare il reset esplicito.

`make db-clear CONFIRM=yes` arresta le app locali, ricrea il database e applica
le migrazioni senza alcun seed: utenti, lezioni, prenotazioni, feedback e
impostazioni restano vuoti. Si conserva solo il journal tecnico delle migrazioni.
Senza CONFIRM=yes il comando si ferma senza cancellare dati. Vale solo per
iepf_dev del progetto locale gestito: non elimina dati della VPS né altri volumi.

Il nuovo database dev è `iepf_dev` in un volume Docker dedicato al progetto
`iepf-dev`. I precedenti bind mount `postgres-data` e `postgres-test-data` non
vengono importati, cancellati o modificati. `make stop` non elimina il volume.
I servizi sono esposti solo sul loopback del Mac; non ci sono container_name
fissi. Non usare `docker compose down -v` se si vogliono conservare i dati.


`make seed-full` applica le migrazioni ed esegue i seed esistenti in ordine:
admin, activator, sezioni, materie, impostazioni globali, utenti mock, materie e
disponibilità tutor, generazione lezioni e prenotazioni/feedback.
Gli indirizzi sono fittizi: ad esempio `mock.student-active-01@example.test` e
`mock.tutor-active-01@example.test`, con password `Password123!`. Admin e activator
usano `admin@example.test` e `activator@example.test`, password `LocalDemo123!` se
creati dal seed; gli account esistenti conservano le proprie password.
Il dataset completo aggiunge 97 utenti mock e 11 inviti, oltre agli account base.
La generazione e le prenotazioni mock sono limitate agli utenti `mock.*@example.test`.
I vecchi alias personali eventualmente già nel DB restano invariati: non vengono
rinominati o cancellati automaticamente.

Le email della generazione lezioni arrivano in Mailpit. Il comando richiede DB
locale e SMTP su loopback anche se eseguito direttamente come
`pnpm seed:all-mock-data`. Il dataset ricco è additivo: rieseguirlo conserva gli
utenti esistenti, ma può aggiungere storico lezioni, prenotazioni e feedback.
Per ripartire da zero: `make db-reset CONFIRM=yes`, poi `make seed-full`.

## Test e verifiche

```bash
make doctor       # verifica runtime, Docker e configurazione
make check        # typecheck, lint e build di entrambe le applicazioni
make test         # DB test effimero + migrazioni SQL + test backend e frontend
```

`make test` usa `iepf_test`, in un container separato con tmpfs e profilo `test`:
lo ricrea all'inizio e lo rimuove alla fine, anche se i test falliscono. Il dev DB
non viene pulito. La suite prova migrazioni, protezioni dei seed, ripetibilità,
autenticazione/refresh e consegna SMTP tramite Mailpit. I messaggi di test sono
ricercati per un subject univoco; la casella locale non viene svuotata.
La CI backend esegue la stessa suite con PostgreSQL e Mailpit come servizi.

I test di infrastruttura non richiedono Docker e si lanciano da `infra/`:
`python3 tests/test_local.py`, `python3 tests/test_ci.py` e, solo su Linux,
`python3 tests/test_deploy.py`.

I comandi di reset, pulizia e seed rifiutano database fuori da loopback o con
nome diverso da `iepf_dev`/`iepf_test`; il test richiede esattamente `iepf_test`.
Il launcher rifiuta Docker context remoti. Un reset richiede sempre CONFIRM=yes.

## Porte e copie multiple

Alla prima preparazione si possono scegliere porte e nome progetto:

```bash
IEPF_DEV_HOME=/tmp/iepf-alt IEPF_DEV_PROJECT=iepf-alt \
DEV_DB_PORT=55432 TEST_DB_PORT=55433 BACKEND_PORT=19999 FRONTEND_PORT=13000 \
SMTP_PORT=11025 MAILPIT_PORT=18025 make setup
IEPF_DEV_HOME=/tmp/iepf-alt make dev
```

Usare lo stesso IEPF_DEV_HOME in tutti i comandi successivi, compreso `make stop`.
Le scelte vengono salvate in `compose.env`; frontend.env, backend.env e test.env
sono generati coerentemente. Per cambiarle in un ambiente già preparato,
arrestarlo e aggiornare tutti i riferimenti nei quattro file. Non rinominare il
progetto se si vuole continuare a usare lo stesso volume dati.

## Produzione

I push su main avviano `.github/workflows/ci-release.yml`, che controlla, costruisce
e rilascia solo ciò che è cambiato. La VPS non effettua checkout Git.
Configurazione, backup, schedulazione e rollback: [runbook](infra/deploy/README.md).
Il Compose locale e il launcher non sono inclusi nei bundle di produzione.
