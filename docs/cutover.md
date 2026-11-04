# Migrazione alla monorepo

Conclusa il 4 novembre 2026. I repository `iepf-backend`, `iepf-frontend` e `iepf-infra` sono
stati importati qui con la loro storia e poi eliminati da GitHub. Il rilascio passa ora solo
da `.github/workflows/ci-release.yml`; il funzionamento è descritto nel
[runbook](../infra/deploy/README.md).

## Cosa è cambiato

- Un solo workflow con filtri per percorso, al posto di tre repository collegati da
  `repository_dispatch` e `INFRA_DISPATCH_TOKEN`.
- `DEPLOY_ENABLED=true` è l'interruttore della produzione: senza, le immagini vengono
  pubblicate ma non parte nessun deploy.
- Gli ID delle release sono `<run-id>-<attempt><slot>`, per esempio `123-11`.
- Nelle immagini la cartella di lavoro è `/app/apps/backend` o `/app/apps/frontend`.
- I package `iepf-backend` e `iepf-frontend` sono collegati a questa repository, che ha il
  ruolo Write. I nomi delle immagini non sono cambiati.

`apply.sh`, `job.sh`, `backup.sh`, `compose.yaml`, i timer, il formato del bundle e il layout
`/opt/iepf` non sono cambiati.

## Storia importata

Sono stati esclusi solo `.env.backend`, `.env.frontend` e `.env.postgres`, committati per
errore in `iepf-infra`. Gli hash dei commit sono diversi dagli originali.

## Rollback

Le migrazioni del database non vengono mai annullate: prima di tornare a un'immagine
precedente, verificare che sia compatibile con lo schema attuale.

| Release | Contenuto |
| --- | --- |
| `41870446270-1` | Ultima della vecchia pipeline |
| `41873995566-11` | Prima con backend e frontend della monorepo |

Per elencare tutte le release: `ls -1t /opt/iepf/releases`. Non eliminare da GHCR le versioni
usate dalla release a cui si vuole tornare: `apply.sh` le scarica per digest.

Dalla monorepo:

```bash
gh workflow run ci-release.yml --repo ITI-P-Hensemberger/iepf -f component=rollback -f release=ID
```

Sulla VPS, se GitHub non è disponibile:

```bash
docker compose --env-file /opt/iepf/shared/host.env --env-file /opt/iepf/releases/ID/images.env -f /opt/iepf/releases/ID/compose.yaml up -d --wait --wait-timeout 180 traefik backend frontend && ln -sfn /opt/iepf/releases/ID /opt/iepf/current
```

Per un database danneggiato: ripristino da backup, sezione "Reset dell'anno scolastico" del
[runbook](../infra/deploy/README.md).

## Attività aperte

- **Rotazione dei segreti:** alla chiusura della migrazione, i valori di `JWT_SECRET`,
  `PASSWORD_SALT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD` e
  `DATABASE_URL` in produzione coincidevano con quelli committati in passato. Cambiare
  `PASSWORD_SALT` invalida tutte le password: va fatto solo con un reset pianificato.
- **Possibili segreti nella storia:** gitleaks segnala 8 risultati in vecchi file
  `apps/backend/http/*.http` e 3 in versioni di `apps/backend/.env.test`, non esaminati.
- **Lockfile:** il primo `pnpm add` ricalcola gran parte di `pnpm-lock.yaml`, anche per il
  backend. Farlo in una PR dedicata.
