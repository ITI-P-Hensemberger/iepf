# Codebase Overview (IEPF Backend)

## Update Requirement for AI Agents

AI agents must update this file whenever they introduce or observe changes or additions that affect structure, conventions, reusable components, or core logic described below.

## High-Level Purpose

TypeScript (ESM) backend API. Provides authentication, tutoring/lesson scheduling, bookings, feedback, tokens, and admin tools. Uses Hono + Zod OpenAPI for routing and validation, Drizzle ORM for DB access, and email notifications for key events.

## Project Structure

- `src/index.ts`: Server entry point.
- `src/app.ts`: App wiring (routes, middleware).
- `src/routes/`: Feature routers. Each feature follows a 3-file pattern:
  - `*.routes.ts`: OpenAPI route schemas (request/response validation).
  - `*.handlers.ts`: Business logic and DB access.
  - `*.index.ts`: Router + middleware wiring.
- `src/db/`: Drizzle ORM setup and schema definitions.
- `src/middlewares/`: Auth, error handling, logging, rate limiting, etc.
- `src/lib/`: Shared utilities (JWT, email, pagination, hashing, tokens, constants, errors).
- `src/scripts/`: Maintenance/cron jobs (lesson generation, reminders, seeds).
- `src/tests/`: Vitest tests and helpers.
- `dist/`: Build output.

## Language, Style, and Tooling

- TypeScript, ESM modules.
- 2-space indentation, single quotes, no semicolons.
- ESLint config: `@antfu/eslint-config`.
- Filenames are `kebab-case`.
- DB tables/columns are `snake_case` (Drizzle schemas).

## Build/Test Commands

- `pnpm run dev`: hot reload (tsx watch).
- `pnpm run build`: compile TS and rewrite path aliases.
- `pnpm run start`: run compiled server from `dist/`.
- `pnpm run typecheck`: type-check only.
- `pnpm run lint` / `pnpm run lint:fix`: ESLint.
- `pnpm run test`: Vitest (NODE_ENV=test).

## Key Architecture Choices

- Routing and validation: Hono + Zod OpenAPI in `src/routes`.
- Data layer: Drizzle ORM + PostgreSQL schemas in `src/db/schemas`.
- Error handling: central error helpers in `src/lib/error-response` + HTTP status helpers.
- Email notifications: templates in `src/lib/email-templates.ts` and sender in `src/lib/mailer`. Booking confirmation emails include the lesson topic when provided.
- Auth: JWT + refresh tokens; routes in `src/routes/auth/`.

## Reusable Components (Common Utilities)

- `src/lib/constants.ts`: shared constants (defaults, error messages).
- `src/lib/http-status-codes.ts` and `src/lib/http-status-phrases.ts`.
- `src/lib/openapi/*`: schema helpers for consistent responses.
- `src/lib/pagination.ts`: paged response building.
- `src/lib/lesson-tokens.ts`: student token balance helpers.
- `src/lib/profanity.ts`: profanity checks.
- `src/lib/email-templates.ts`: all email bodies/subjects.
- `src/lib/mailer.ts`: email transport.

## Domain Model Summary

- Users have roles: `student`, `tutor`, `admin`, `activator`.
- Tutor profile/settings/availability:
  - `tutor_profiles`: profile + `isActive`.
  - `tutor_settings`: per-tutor configuration (e.g., `dailyCapacity`).
  - `tutor_weekday_availability`: weekly availability (weekday 1–5, start time).
- Lessons and bookings:
  - `lessons`: scheduled lesson sessions.
  - `lesson_bookings`: student bookings per lesson.
  - `lesson_feedback`: feedback per booking (student/tutor).
- Tokens:
  - `token_ledger`: audit of student token changes.
  - `users.lessonTokens`: current balance.

## Core Logic (Key Behaviors)

- Lessons are generated via job based on tutor availability, subjects, and capacity.
- Booking rules include:
  - Booking cutoff is 20:00 the day before the lesson.
  - Student daily booking limit (max 1 per day).
  - Tutor daily capacity controls booking count and lesson seats.
- Cancellation rules:
  - Tutors can only cancel lessons with no confirmed bookings.
  - Admin can cancel/reschedule regardless and emails are sent.
- Presence and counts:
  - Tutor can set student presence within a specific window after start.
  - Presence updates can flip `countsForTutor`.
- Feedback rules:
  - Allowed only after lesson start.
  - Tutor feedback requires text and rating; one feedback per role per booking.

## Jobs / Scripts

- `src/scripts/generate-weekly-lessons.ts`: weekly lesson generation.
- `src/scripts/remind-upcoming-lessons.ts`: reminder emails for today/tomorrow.
- `src/scripts/remind-missing-feedback.ts`: reminder emails for missing feedback.
- `src/scripts/seed-*`: seed scripts for dev/test data.

## Security and Validation

- Required env vars validated in `src/env.ts`.
- Role-based access control enforced in handlers.
- Rate limits in `src/middlewares/rate-limit` and auth routes.
- Avoid logging secrets (lint rule enforced).

## Conventions for Routes

- OpenAPI schemas in `*.routes.ts` define validation, responses, and status codes.
- `*.handlers.ts` contains only logic (DB calls, checks, emails).
- `*.index.ts` wires router + auth middleware.
- Use `buildPagedResponse` for list endpoints.

## Notes for Contributors/Agents

- Preserve existing style and naming.
- Keep business rules in handlers, not in routes.
- Prefer shared helpers in `src/lib` rather than duplicating logic.
- Update this file when adding new modules, changing logic/rules, or adding new shared utilities.
