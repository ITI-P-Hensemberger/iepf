# IEPF backend

API Hono/TypeScript, PostgreSQL 16 e Drizzle. Runtime: Node 22 e pnpm 10.28.2.
`pnpm-lock.yaml` è l'unico lockfile; locale, CI e Docker usano installazioni frozen.

Per avviare l'intero progetto, clonare frontend e infra come cartelle affiancate,
poi da `iepf-infra` eseguire `make setup`, `make dev` e facoltativamente `make seed`.
La [guida locale](https://github.com/ITI-P-Hensemberger/iepf-infra#sviluppo-locale)
include porte, utenti demo, Mailpit, reset e test isolati.

Comandi nella repo: `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm db:generate`, `pnpm db:migrate`. Generare e committare le migrazioni SQL;
la pipeline le applica in produzione dopo il backup.

`ENV_FILE=/percorso/file.env` seleziona un file diverso da `.env` (`.env.test` nei
test). Le variabili del processo hanno precedenza; i file non sovrascrivono la
configurazione esportata. Non copiare env di produzione nel setup locale.

`pnpm seed:dev` richiede un database loopback chiamato iepf_dev o iepf_test e un
NODE_ENV development/test. Il seed è piccolo, ripetibile, non invia email e non
sovrascrive gli utenti demo già modificati. `db:clean` applica la stessa protezione.
`make seed-full` in infra esegue la catena storica completa tramite
`pnpm seed:all-mock-data`, incluse le impostazioni globali. I mock usano indirizzi
`mock.*@example.test`, password `Password123!`, e le notifiche finiscono in Mailpit.
I seed mock richiedono DB e SMTP locali; non modificano gli alias personali già
esistenti. La generazione standard di produzione non usa il filtro --mock-only.
Il seed ricco è additivo: rieseguirlo può aggiungere storico e feedback.
Nessun seed viene eseguito automaticamente da make dev.

`make test` in infra prepara il DB di test, applica tutte le migrazioni e avvia
`pnpm test` (Vitest run); `pnpm test:watch` è disponibile se DB e Mailpit sono già
attivi. `pnpm test` non avvia Docker da solo. La suite è sequenziale e rifiuta DB
con nome diverso da iepf_test. In CI PostgreSQL e Mailpit sono servizi dedicati.
