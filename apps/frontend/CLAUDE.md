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

### UI Components

- Shadcn/ui components in `components/ui/` (Radix UI primitives + Tailwind)
- Light/dark theme support via `next-themes`
- All user-facing text is in Italian

## Key Patterns

- TypeScript strict mode throughout
- Path alias: `@/*` maps to project root
- Styling: Tailwind CSS with `cn()` utility from `lib/utils.ts`
- Tests: Vitest (`pnpm test`), `*.test.ts` next to the code
