# Cutover alla monorepo

Stato: **da approvare**. Nessun passo di questo piano è stato eseguito: la monorepo
esiste solo in locale, non è stato fatto alcun push e i tre repo originali sono intatti.

## Cosa cambia in produzione

Nulla sulla VPS. `apply.sh`, `job.sh`, `backup.sh`, `compose.yaml` e i timer sono identici
ai sorgenti importati, così come il formato del bundle, il layout `/opt/iepf` e i nomi
immagine. Cambiano:

- chi avvia il deploy: un solo workflow invece di tre repo collegati da `repository_dispatch`;
- l'ID delle nuove release: `<run-id>-<attempt><slot>`, per esempio `123-11`, compatibile
  con le regex di `apply.sh`;
- l'interno delle immagini: la cartella di lavoro passa da `/app` a `/app/apps/backend` e
  `/app/apps/frontend`. `compose.yaml` e `job.sh` non usano percorsi assoluti nel container.

## Decisioni da prendere prima

1. **Nome del repo.** Il piano usa `ITI-P-Hensemberger/iepf`, oggi libero, privato.
2. **Commit non ancora su `main`.** La monorepo è importata dal branch
   `fix/booking-integrity-rate-limits`, che è un commit avanti rispetto a `main` in ogni repo:

   | Repo | Commit | Contenuto |
   | --- | --- | --- |
   | iepf-backend | `d98ae08` | prenotazioni atomiche, rate limit, migrazione `0013` |
   | iepf-frontend | `14fa6f6` | IP client verso il backend, test |
   | iepf-infra | `7019199` | probe `/health`, documentazione del reset |

   Il primo deploy del backend dalla monorepo porterebbe anche questi commit e la migrazione.
   **Raccomandazione:** rilasciarli prima con la vecchia pipeline (merge fast-forward su `main`
   di ogni repo), così il primo deploy dalla monorepo contiene solo il cambio di packaging e
   un eventuale problema ha una sola causa possibile.
3. **Segreti nella vecchia storia di infra.** I commit `58e7d37` e `cfca22d` di `iepf-infra`
   contengono `.env.backend`, `.env.frontend` e `.env.postgres` con valori reali
   (`JWT_SECRET`, `PASSWORD_SALT`, `SMTP_PASS`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`).
   Questi tre file sono stati esclusi dalla storia importata, tutto il resto è conservato.
   Restano però nel repo originale, anche da archiviato, e coincidono ancora con la copia
   locale `iepf-infra/.env.backend`. **Verificare sulla VPS se sono gli stessi in uso** e, in
   quel caso, ruotarli a parte. Attenzione: cambiare `PASSWORD_SALT` può invalidare le password
   esistenti, va valutato separatamente.

## Passi manuali

### Preparazione, senza effetti sulla produzione

1. Bloccare i merge sui tre repo originali. Se arrivano altri commit, portarli nella monorepo:

   ```bash
   git -C ../iepf-backend format-patch --stdout d98ae08..main | git am --directory=apps/backend
   ```

2. Creare il repo e collegare il remote, **senza** impostare `DEPLOY_ENABLED`:

   ```bash
   gh repo create ITI-P-Hensemberger/iepf --private
   ```

   ```bash
   git remote add origin https://github.com/ITI-P-Hensemberger/iepf.git
   ```

3. Dare accesso ai package GHCR. Per `iepf-backend` e `iepf-frontend`, nelle impostazioni del
   package su GitHub (Organization → Packages → Package settings):
   - **Manage Actions access**: aggiungere `iepf` con ruolo **Write**;
   - **Inherit access from source repository**: se attivo, disattivarlo, perché il repo sorgente
     verrà archiviato.

   Non ho potuto leggere la configurazione attuale: il token `gh` non ha `read:packages`.

4. Impostare secret e variabili. `VPS_SSH_KEY` non è leggibile dai vecchi repo: usare la chiave
   conservata oppure generarne una dedicata e aggiungerla ad `authorized_keys` con `restrict`.

   ```bash
   gh secret set VPS_SSH_KEY --repo ITI-P-Hensemberger/iepf < percorso/chiave
   ```

   ```bash
   ssh-keyscan -p PORTA HOST | gh secret set VPS_KNOWN_HOSTS --repo ITI-P-Hensemberger/iepf
   ```

   ```bash
   gh variable set VPS_HOST --repo ITI-P-Hensemberger/iepf --body HOST
   ```

   ```bash
   gh variable set VPS_USER --repo ITI-P-Hensemberger/iepf --body root
   ```

   ```bash
   gh variable set VPS_PORT --repo ITI-P-Hensemberger/iepf --body PORTA
   ```

   Confrontare l'impronta ottenuta da `ssh-keyscan` con quella letta sulla VPS. In alternativa,
   riutilizzare il valore già noto di `VPS_KNOWN_HOSTS`.

### Prova a vuoto, con la produzione ancora sulla vecchia pipeline

5. Primo push di `main`. Senza una base precedente conta come modifica di tutto: girano tutti i
   controlli e vengono pubblicate le immagini `:<sha>`, ma il job `deploy` viene saltato.

   ```bash
   git push -u origin main
   ```

6. Verificare che il run sia verde e annotare i tre digest dal log dei job `backend-image`
   e `frontend-image`. Pubblicare un tag nuovo non tocca la produzione, che usa digest fissati.

### Attivazione

Da fare in una finestra presidiata, fuori dagli orari dei job: backup 02:00, reminder 12:00,
17:00, 20:30, generazione lezioni sabato 12:00.

7. Sulla VPS annotare la release attiva, cioè il punto di rollback `PRE`, e fare un backup:

   ```bash
   readlink -f /opt/iepf/current
   ```

   ```bash
   bash /opt/iepf/current/backup.sh
   ```

8. Spegnere la vecchia pipeline. I secret restano, servono per il rollback:

   ```bash
   gh workflow disable "CI and release" --repo ITI-P-Hensemberger/iepf-backend
   ```

   ```bash
   gh workflow disable "CI and release" --repo ITI-P-Hensemberger/iepf-frontend
   ```

   ```bash
   gh workflow disable "Production deploy" --repo ITI-P-Hensemberger/iepf-infra
   ```

   ```bash
   gh workflow disable "Infrastructure checks" --repo ITI-P-Hensemberger/iepf-infra
   ```

9. Abilitare il deploy. Da qui ogni push su `main` può arrivare in produzione:

   ```bash
   gh variable set DEPLOY_ENABLED --repo ITI-P-Hensemberger/iepf --body true
   ```

10. Attivare un componente alla volta, verificando dopo ciascuno (passo 11):

    ```bash
    gh workflow run ci-release.yml --repo ITI-P-Hensemberger/iepf -f component=infra
    ```

    ```bash
    gh workflow run ci-release.yml --repo ITI-P-Hensemberger/iepf -f component=frontend -f image=ghcr.io/iti-p-hensemberger/iepf-frontend@sha256:DIGEST
    ```

    ```bash
    gh workflow run ci-release.yml --repo ITI-P-Hensemberger/iepf -f component=backend -f image=ghcr.io/iti-p-hensemberger/iepf-backend@sha256:DIGEST -f tools_image=ghcr.io/iti-p-hensemberger/iepf-backend@sha256:TOOLS_DIGEST
    ```

    Il primo non cambia immagini e prova solo SSH, bundle e `apply.sh`. Il terzo cambia l'immagine
    di manutenzione, quindi esegue backup e migrazioni prima di attivare.

11. Verifiche dopo ogni passo:

    ```bash
    curl -fsS -o /dev/null -w '%{http_code}\n' https://iepf.hensemberger.it/auth/login
    ```

    ```bash
    readlink -f /opt/iepf/current
    ```

    ```bash
    systemctl list-timers 'iepf-*'
    ```

    Dopo il backend, controllare anche login e una prenotazione, poi lanciare a mano un job
    sull'immagine di manutenzione. `db:migrate` è idempotente e non invia email:

    ```bash
    docker compose --env-file /opt/iepf/shared/host.env --env-file /opt/iepf/current/images.env -f /opt/iepf/current/compose.yaml run --rm --no-deps maintenance npm run db:migrate
    ```

12. Prova del flusso normale: un PR che tocca solo un file del frontend deve eseguire soltanto
    `frontend-checks`, e dopo il merge rilasciare solo il frontend.

### Chiusura, dopo almeno un sabato di job regolari

13. Archiviare i vecchi repo, **senza cancellarli**: la cancellazione può rimuovere l'accesso ai
    package collegati e con essa le immagini usate per il rollback.

    ```bash
    gh repo archive ITI-P-Hensemberger/iepf-backend
    ```

    ```bash
    gh repo archive ITI-P-Hensemberger/iepf-frontend
    ```

    ```bash
    gh repo archive ITI-P-Hensemberger/iepf-infra
    ```

14. Prima di archiviare, rimuovere `INFRA_DISPATCH_TOKEN` da backend e frontend, revocare il
    relativo token su GitHub e togliere `VPS_SSH_KEY` da `iepf-infra`. Se la chiave è stata
    sostituita, togliere quella vecchia anche da `authorized_keys`.

## Rollback

Le migrazioni del database non vengono mai annullate automaticamente. Prima di tornare a
un'immagine precedente, verificare che sia compatibile con lo schema attuale.

| Quando | Cosa fare |
| --- | --- |
| Prima del passo 8 | Niente da annullare: la produzione non è stata toccata. Eventualmente cancellare il nuovo repo. |
| Passi 8-9, nessun deploy partito | `gh variable delete DEPLOY_ENABLED`, poi `gh workflow enable` per i quattro workflow disabilitati. |
| Attivazione fallita | `apply.sh` ripristina da solo la release precedente e lascia il workflow in errore. Controllare con il passo 11. |
| Applicazione difettosa, pipeline sana | Rollback dalla monorepo: comando A qui sotto. |
| Pipeline nuova inutilizzabile | Riabilitare i vecchi workflow, poi rollback da `iepf-infra`: comando B qui sotto. |
| GitHub non disponibile | Sulla VPS: comando C qui sotto. |
| Migrazione o dati danneggiati | Ripristino da backup, sezione "Reset dell'anno scolastico" del [runbook](../infra/deploy/README.md). |

Comando A:

```bash
gh workflow run ci-release.yml --repo ITI-P-Hensemberger/iepf -f component=rollback -f release=PRE
```

Comando B:

```bash
gh workflow run deploy.yml --repo ITI-P-Hensemberger/iepf-infra -f component=rollback -f release=PRE
```

Comando C, che riporta anche il link `current`:

```bash
docker compose --env-file /opt/iepf/shared/host.env --env-file /opt/iepf/releases/PRE/images.env -f /opt/iepf/releases/PRE/compose.yaml up -d --wait --wait-timeout 180 traefik backend frontend && ln -sfn /opt/iepf/releases/PRE /opt/iepf/current
```

Dopo un ritorno ai vecchi repo, disattivare il deploy della monorepo con
`gh variable delete DEPLOY_ENABLED`. I commit fatti nel frattempo si riportano indietro con
`git format-patch --relative=apps/backend` e `git am` nel repo originale, una cartella alla volta.

## Sviluppo locale dopo il cutover

Prima `make stop` da `iepf-infra`, poi copiare gli env locali:

```bash
cp -a ../iepf-infra/.local .local
```

Il database dev conserva utenti e password solo con il vecchio `PASSWORD_SALT`, contenuto in
`.local/backend.env`. Senza questa copia, `make setup` genera nuovi segreti e gli account
esistenti non possono più accedere: in quel caso serve `make db-reset CONFIRM=yes`.
Il progetto Compose resta `iepf-dev`, quindi il volume dei dati è lo stesso.

## Cosa non è stato verificato

Il workflow non è mai girato su GitHub, perché richiede il push. Le verifiche locali coprono la
sintassi, gli script e le immagini, ma non i permessi GHCR, `DEPLOY_ENABLED` né l'SSH reale: per
questo esistono la prova a vuoto del passo 5 e l'attivazione `infra` del passo 10.
