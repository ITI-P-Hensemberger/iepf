# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IEPF Frontend is a Next.js 16 application for an Italian educational platform (InsiemeÈ+Facile). It supports four user roles: students, tutors, admins, and activators, each with distinct access patterns and interfaces.

## Commands

```bash
pnpm dev      # Start development server on localhost:3000
pnpm build    # Build for production
pnpm lint     # Run ESLint
pnpm test     # Run Vitest
pnpm start    # Start production server
```

## Environment

Requires `API_BASE_URL` pointing to the backend (default: `http://localhost:9999` in development).

## Architecture

### Routing & Layout Groups

Uses Next.js App Router with route groups that share layouts without affecting URL paths:
- `(admin)/` - Admin dashboard routes
- `(student)/` - Student routes
- `(tutor)/` - Tutor routes
- `(activator)/` - Activator routes
- `(protected)/` - Routes requiring authentication
- `auth/` - Authentication pages (login, signup, password reset)
- `api/` - API route handlers

### Authentication Flow

JWT-based authentication with access + refresh token pattern:
- Tokens stored in HTTP-only cookies (`iepf_access`, `iepf_refresh`, `iepf_access_expires_at`, `iepf_refresh_expires_at`)
- Middleware in `proxy.ts` handles token refresh and role-based redirects
- `useSession()` hook (`lib/use-session.ts`) provides session state to components

Key files:
- `proxy.ts` - Middleware handling auth redirects and token refresh
- `lib/auth.ts` - JWT decoding, login/refresh logic
- `lib/auth-cookies.ts` - Cookie management
- `lib/use-session.ts` - React hook for session state

### Role-Based Access Control

Guard components wrap role-specific pages:
- `components/*-guard.tsx` - Check session and redirect unauthorized users
- Inactive users (pending approval) are redirected to `/{role}/pending` pages

Role redirect logic (in `proxy.ts`):
- Authenticated users on auth pages → role home
- Users without required role → home
- Inactive users → pending pages

### Forms

Pattern using React Hook Form + Zod:
```typescript
const formSchema = z.object({ ... })
type FormValues = z.infer<typeof formSchema>

const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  mode: 'onBlur'
})
```

### API Communication

- All backend calls go through Next.js API routes in `app/api/`
- Backend URL configured via `API_BASE_URL` environment variable
- Response utilities in `lib/backend-response.ts` handle the `{ success, data }` envelope
- **API documentation available at http://localhost:9999/doc** (consult for endpoint contracts)
- Response types come from `lib/api/schema.ts`, generated from the backend OpenAPI document: use `ApiResponse<'/path'>` from `lib/api` instead of guessing the shape. After changing a backend route run `pnpm --filter iepf-backend run api:types` and commit the result; CI fails when the file is stale.

### UI Components

- Shadcn/ui components in `components/ui/` (Radix UI primitives + Tailwind)
- Light/dark theme support via `next-themes`
- All user-facing text is in Italian

## Key Patterns

### Back navigation: back leads where the user came from

Every inner page's back button goes to the page the user opened it from, not to a fixed parent.
New and changed pages must keep this:
- A link or `router.push` to an inner page adds the current page as `?from=`:
  `withFrom(href, useHere())` from `lib/back-link.ts` (path and query, so filters, tabs, days and
  an earlier `from` survive: chains like student → lesson → feedback → back → back work).
- `PageHeader` (and `SectionLayout`, which uses it) follows `?from=` by itself; `backHref` is only
  the fallback for pages opened from the menu, a notification or a bookmark. A page drawing its
  own `BackButton` uses `useBackHref(fallback)`.
- Tabs and sections change the URL with `useSetParam()`, which keeps `from` and the other params.
- Never build a page URL from scratch where `from` could be dropped.

### UI guide: how to build a page that fits

Every new or changed page uses these pieces; don't hand-roll a header, a tab bar, a filter form
or a loading text. If something is missing, extend the shared component rather than copy it.

**Pick the layout by page type**
| Page | Layout |
| --- | --- |
| Role home | `HomeHeader` + sections (`text-lg font-semibold` titles) |
| Inner page (list, detail, form) | `<main className='flex-1'>` › `container mx-auto px-4 pt-10 pb-16` › `mx-auto max-w-6xl` (student pages `max-w-3xl`) › `PageHeader` |
| Page with several parts (profile, user details, settings) | `SectionLayout`, one `?tab=` per section; Danger zone last, `separatorBefore` |
| Global settings section | `SettingsSection` (title, one line, actions on the right) |
| Login, sign-up, reset, verify, onboarding | `AuthLayout` (`wide` for long forms, `backHref={null}` for a step to complete); outcomes in `ResultPanel` |
| Maintenance, 404, error, pending | `StatusBlock` |
| Public text (FAQ, privacy, terms) | `PageHeader` in a `max-w-3xl` column |

**Navigation**: back leads where the user came from (see "Back navigation" above): `withFrom` on
links into inner pages, `useSetParam` for tabs, nothing rebuilt from scratch.

**Lists**: `FilterForm` (sticky search, other filters in the closed "Filtri" panel, applied as they
change), sorting only from column headers (`SortableHead`, `TableHeader sticky`), `ListPagination`,
list tabs in `?tab=`. Every list has a search; lesson searches accept dates ("13/11", "13 nov").

**Controls**
- Pills between views: `components/ui/tabs` or `SegmentedTabs` (never a row of Buttons).
- On/off that saves at once: `Switch`; a choice inside a form saved by a button: `Checkbox`.
- A clickable card is a tile (`TILE` from `lib/tile.ts`), not a button: rounder, lifts on hover.
- Long forms: save button in the sticky footer (`STICKY_CARD_FOOTER` / `STICKY_SECTION_FOOTER`).
- Irreversible actions: in a Danger zone section, confirmed in a dialog (user deletion: the
  admin's password, `ConfirmDeleteDialog`).
- Free text fields start with a capital (`capitalizeFirst`); search fields keep spaces as typed
  and are trimmed only for the API.

**States**: `PageSkeleton` / `BlockSkeleton` / `TableSkeletonRows` while loading (the word
"Caricamento..." only in buttons and inline values), `EmptyState` when there is nothing, short
toasts ("Profilo aggiornato.", never "… con successo").

**Mobile**: controls that must stay reachable go in `StickyBar`; anything sticking below them
uses `top-[var(--sticky-top)]` (bars publish their height through `lib/sticky.ts`). Check every
page at 375px.

**Colour (Grafite palette, `app/globals.css`)**
- Only tokens: `bg-background`, `bg-card`, `bg-muted`, `text-muted-foreground`, `border`… Never
  `bg-white`, `text-black`, `text-white/75` for UI chrome.
- `primary` is the logo's orange: main buttons, active tabs and menu items, switches. Text in the
  accent (links, active labels) uses `text-[var(--primary-text)]`, readable in both themes.
- `--school` is the school's blue, for the school's name.
- `bg-card` gets the card shadow by itself; a sticky label on a card uses `bg-[var(--card)]` so
  it doesn't lift.
- Status colours (emerald, amber, destructive) only for meaning: done, warning, danger.
- Look at every change in both themes; light and dark must both read well.

**Copy**: Italian, sentence case ("Domande frequenti", not "Domande Frequenti"), short helper lines
ending with a full stop, buttons as verbs ("Salva modifiche", "Aggiungi domanda").

### General

- TypeScript strict mode throughout
- Path alias: `@/*` maps to project root
- Styling: Tailwind CSS with `cn()` utility from `lib/utils.ts`
- Tests: Vitest (`pnpm test`), `*.test.ts` next to the code
