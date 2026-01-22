# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript API code. Entry points: `src/index.ts` (server) and `src/app.ts` (app wiring).
- `src/routes/` follows a 3-file pattern per feature: `*.routes.ts` (OpenAPI), `*.handlers.ts` (logic/DB), `*.index.ts` (router + middleware).
- `src/db/` holds Drizzle ORM schemas and DB utilities.
- `src/middlewares/` includes auth, logging, and error handling.
- `src/lib/` contains shared utilities (JWT, email, pagination, hashing).
- `src/scripts/` provides DB seed and maintenance scripts.
- `src/tests/` houses Vitest tests and helpers; tests are `*.test.ts`.
- Build output goes to `dist/`.

## Build, Test, and Development Commands
- `pnpm run dev` — start the API with hot reload via `tsx watch`.
- `pnpm run build` — compile TypeScript and rewrite path aliases.
- `pnpm run start` — run the compiled server from `dist/`.
- `pnpm run typecheck` — type-check without emitting.
- `pnpm run lint` / `pnpm run lint:fix` — ESLint checks and auto-fix.
- `pnpm run test` — run Vitest with `NODE_ENV=test`.
- DB utilities: `pnpm run db:generate`, `db:push`, `db:migrate`, `db:studio`, `db:reset`.

## Coding Style & Naming Conventions
- TypeScript, ESM modules, 2-space indentation, single quotes, and no semicolons.
- Filenames use `kebab-case` (e.g., `tutor-subjects.routes.ts`).
- ESLint (`@antfu/eslint-config`) is the source of truth; run `pnpm run lint` before pushing.
- DB tables and columns use `snake_case` in Drizzle schemas.

## Testing Guidelines
- Framework: Vitest. Tests live in `src/tests/` and use `*.test.ts` naming.
- Use helpers from `src/tests/test-helpers.ts` and `testClient(createTestApp(router))`.
- Tests run sequentially; avoid concurrency assumptions.
- Run a targeted test with `pnpm run test -- src/tests/users.test.ts`.

## Commit & Pull Request Guidelines
- Commit messages are short, imperative, sentence case (e.g., “Fix migration journal seeding”).
- PRs should include a clear description, linked issue (if applicable), and notes on DB migrations or env var changes.
- If behavior or routes change, include a brief test plan and any new endpoints or params.

## Security & Configuration Tips
- Required env vars are validated in `src/env.ts` (e.g., `DATABASE_URL`, `JWT_SECRET`, `PASSWORD_SALT`).
- Avoid logging secrets; `node/no-process-env` is enforced.
