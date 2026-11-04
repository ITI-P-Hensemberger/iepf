# Codebase Guide (IEPF Frontend)

IMPORTANT: All agents must update this file whenever they add, remove, or change anything that affects architecture, conventions, shared components, or UX/UI patterns.

## Overview
IEPF Frontend is a Next.js 16 App Router project for an Italian educational platform (InsiemeÈ+Facile). It serves four roles: student, tutor, admin, activator. UI is Italian. Backend is consumed via Next API routes under `app/api/*` and proxied to `API_BASE_URL`.

## Runtime & Tooling
- Framework: Next.js 16 App Router (React 19)
- Styling: Tailwind CSS v4 + `tw-animate-css`
- UI primitives: Radix UI via custom wrappers in `components/ui/*`
- State/data: React hooks + fetch to Next API routes
- TypeScript, ESLint, Vitest (`*.test.ts` next to the code)
- Scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`

## App Structure
- `app/` contains routes (App Router)
- Route groups by role:
  - `app/(admin)/...`
  - `app/(student)/...`
  - `app/(tutor)/...`
  - `app/(activator)/...`
  - `app/(protected)/...`
- Auth pages: `app/auth/*`
- API routes: `app/api/*`
- Shared components: `components/*`
- UI primitives: `components/ui/*`
- Utilities/hooks: `lib/*`

## Layout & Providers
- Root layout: `app/layout.tsx`
- Providers used globally:
  - `ThemeProvider` (light/dark, system)
  - `SettingsProvider` (maintenance/service messages)
  - `Toaster` (Sonner)
  - `ImpersonationBanner`
- Global CSS: `app/globals.css` (Tailwind v4 theme tokens via CSS variables)

## Auth & Role Guards
- Session hook: `lib/use-session.ts` (calls `/api/auth/session`)
- Role guards:
  - `components/admin-guard.tsx`
  - `components/student-guard.tsx`
  - `components/tutor-guard.tsx`
  - `components/activator-guard.tsx`
- Inactive users are redirected to `/{role}/pending`
- Header (`components/header.tsx`) adapts menu by role
- `proxy.ts` handles backend auth token refresh/redirect logic

## API Integration Pattern
- All frontend calls go through Next API routes in `app/api/*`
- Backend responses often wrap `{ success, data }`
- Helpers in `lib/backend-response.ts`:
  - `parseBackendPayload`, `unwrapBackendData`, `extractPayloadArray`
- Example normalization: `app/api/lessons/route.ts` maps `dailyCapacity` -> `dailyAvailability`
- Backend contract is stored in `api-doc.json`
- Route handlers call the backend through `backendFetch` (`lib/backend-fetch.ts`), and `lib/auth.ts` takes the request headers: the backend only sees this app, so without the client address all users share one rate-limit bucket and audit logs lose the IP

## UI & UX Conventions
- All UI text in Italian
- Page layout often uses:
  - `container mx-auto px-4 py-10`
  - `max-w-*` for content width
- Cards: `components/ui/card.tsx`
- Tables: `components/ui/table.tsx` wraps table in `overflow-auto`
- Buttons: `components/ui/button.tsx` supports `variant` and `size`
- Badges: `components/ui/badge.tsx` supports `variant` (default/secondary/success/warning/destructive/outline)
- Tabs: `components/ui/tabs.tsx` (Radix)
- Select: `components/ui/select.tsx` (Radix)
- Toasts: `sonner` via `components/ui/sonner.tsx`

## Reusable Components (High-Usage)
- `BackButton` for consistent navigation back
- `Header` and `Footer`
- `MaintenanceBlock` and `ServiceMessageBanner` for maintenance/service messaging
- `ImpersonationBanner` for admin impersonation
- `SettingsProvider` for global maintenance/service settings
- `ProtectedShell` for layout scaffolding

## Data Display Patterns
- Tables with loading/empty states and pagination buttons are common
- Filtering/search often uses `URLSearchParams` to persist in query string
- Use `formatItalianDate` (`lib/format-date.ts`) for date display

## Recent Feature Patterns
- “Non prenotabile” badge for tutor lessons uses `dailyOccupancy >= dailySeats` (mapped from `dailyAvailability` or `dailyCapacity`) and shows only for `status === scheduled`
- Admin dashboard includes two lesson tables (today and scheduled) with similar UI
- Admin stats uses Tabs on desktop and Select on mobile to avoid overflow

## Files to Know
- `components/admin-stats-page.tsx` (stats UI, tabs/select)
- `components/tutor-lessons-page.tsx` (lesson list with non-bookable badge)
- `components/tutor-lesson-details-page.tsx` (lesson detail with non-bookable badge)
- `app/(admin)/admin/page.tsx` (admin dashboard tables)
- `app/api/lessons/route.ts` (lesson list normalization)

## Conventions
- Use `cn()` from `lib/utils.ts` to merge class names
- Lessons with free seats stay bookable after the first booking (`scheduled` or `confirmed`); use `lessonBookableSeats` (`lib/lesson-seats.ts`) for the count shown to students
- Prefer `extractPayloadArray` for list payloads with uncertain shapes
- Keep UX text Italian and consistent with existing tone
- Avoid adding new dependencies unless necessary
- When adding a shared pattern, prefer a reusable component in `components/` or `components/ui/`


## Delivery
- `.github/workflows/ci-release.yml` runs pnpm-based typecheck, lint, and build on pull requests and main.
- Main publishes a linux/amd64 image to GHCR and dispatches its immutable digest to `ITI-P-Hensemberger/iepf-infra`.
- Production activation, health checks, and rollback are managed by the infra repository.
- `INFRA_DISPATCH_TOKEN` is a repository secret scoped to dispatching events to the infra repository.
- Docker excludes all local `.env.*` files; `API_BASE_URL` is supplied at runtime.

- CI and Docker pin pnpm 10.28.2 and install with `--frozen-lockfile`, honoring `pnpm-workspace.yaml` overrides.
- `pnpm-lock.yaml` is authoritative for frontend development and deployment.

## Local development
- The infra repo provides `make setup`, `make dev`, `make stop`, `make seed`, `make test`, and `make check` for the sibling repo layout.
- Managed env files live in `iepf-infra/.local/`; the launcher exports frontend variables directly, preserving existing frontend `.env` files.
- Node 22 and pnpm 10.28.2 are shared across both application repositories. `pnpm-lock.yaml` is authoritative; npm lockfiles have been removed.
- Mailpit captures local email; the infra README documents demo accounts, separate dev/test databases and configurable ports.
- `next.config.ts` pins Turbopack and standalone tracing roots to the frontend directory so parent/sibling lockfiles cannot change CSS/module resolution.
