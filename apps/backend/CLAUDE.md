# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IEPF Backend is a TypeScript REST API for an educational platform built with Hono, Drizzle ORM, and PostgreSQL. It manages tutoring lessons, users (admin/tutor/student/activator roles), and booking workflows.

## Common Commands

```bash
# Development
pnpm run dev              # Start dev server with hot reload
pnpm run typecheck        # Type checking without emitting

# Linting & Formatting
pnpm run lint             # Run ESLint
pnpm run lint:fix         # Auto-fix lint issues

# Testing
pnpm run test             # Run vitest (requires NODE_ENV=test)

# Database
pnpm run db:generate      # Generate Drizzle migrations
pnpm run db:push          # Push schema changes to database
pnpm run db:migrate       # Run migrations
pnpm run db:studio        # Open Drizzle Studio GUI
pnpm run db:reset         # Full reset: clean + migrate + seed all

# Building
pnpm run build            # Compile TypeScript (tsc && tsc-alias)
```

## Architecture

### Route Module Pattern
Each feature follows a 3-file structure in `src/routes/`:
- `*.routes.ts` - OpenAPI route definitions using `@hono/zod-openapi`
- `*.handlers.ts` - Business logic and database queries
- `*.index.ts` - Router wiring with middleware

### Key Directories
- `src/db/schemas/` - Drizzle ORM table definitions (18 tables)
- `src/routes/` - Feature-based route modules (auth, users, lessons, etc.)
- `src/middlewares/` - Auth, logging, error handling
- `src/lib/` - Shared utilities (JWT, password hashing, email, pagination)
- `src/scripts/` - Database seeding scripts

### Type Flow
Drizzle schemas → `drizzle-zod` → Zod validators → OpenAPI specs. Route handlers receive typed context via `AppRouteHandler<RouteType>`.

### Authentication
JWT Bearer tokens with access/refresh token pattern. Auth middleware sets `currentUser` in Hono context. Roles: `admin`, `tutor`, `student`, `activator`. Admin/tutor profiles have `isActive` flag.

### API Patterns
- Pagination: `{ items, total, hasMore }` with `limit`, `offset`, `sortBy`, `sortDir` params
- Errors: Italian messages, Zod issue formatting via `buildErrorResponse()`
- OpenAPI docs auto-generated at `/api` (Scalar UI)

### Database
PostgreSQL with Drizzle ORM. Tables use snake_case. Cascade deletes on user relationships.

## Testing

Tests use Vitest with `testClient(createTestApp(router))`. Helpers in `src/tests/test-helpers.ts` provide `seedAdminUser()`, `createAccessToken()`, etc. Tests run sequentially (no concurrency).

## Environment

Key env vars defined in `src/env.ts` with Zod validation. Requires: `DATABASE_URL`, `JWT_SECRET` (32+ chars), `PASSWORD_SALT`, SMTP config for emails.
