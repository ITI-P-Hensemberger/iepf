-- Store every timestamp as an absolute instant (timestamptz).
-- Old values were wall-clock times without zone, written two ways:
--   created_at: DB default now() under timezone=Europe/Rome -> Rome time.
--   other columns: Drizzle Date.toISOString() -> UTC time.
--   updated_at: Rome while untouched since insert (equal to created_at,
--   both from the same now()), UTC once Drizzle's $onUpdate rewrote it.
-- USING sees the old row, so updated_at is compared with the old created_at.
ALTER TABLE "admin_invite_tokens"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "admin_profiles"
  ALTER COLUMN "deactivated_at" SET DATA TYPE timestamp with time zone USING "deactivated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "audit_logs"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome';
--> statement-breakpoint
ALTER TABLE "class_sections"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "email_verification_tokens"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "global_settings"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "lesson_bookings"
  ALTER COLUMN "student_presence_at" SET DATA TYPE timestamp with time zone USING "student_presence_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "canceled_at" SET DATA TYPE timestamp with time zone USING "canceled_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "lesson_feedback"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "lessons"
  ALTER COLUMN "start_at" SET DATA TYPE timestamp with time zone USING "start_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "generated_for_week" SET DATA TYPE timestamp with time zone USING "generated_for_week" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
-- No created_at to tell an untouched row apart: a first save keeps the Rome default,
-- later saves are UTC. Most rows are a single save and nothing reads the column yet.
ALTER TABLE "notification_preferences"
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'Europe/Rome';
--> statement-breakpoint
ALTER TABLE "password_reset_tokens"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
-- saveSubscription always writes updated_at from Node.
ALTER TABLE "push_subscriptions"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_success_at" SET DATA TYPE timestamp with time zone USING "last_success_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "refresh_tokens"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "rotated_at" SET DATA TYPE timestamp with time zone USING "rotated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "reminder_deliveries"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome';
--> statement-breakpoint
ALTER TABLE "student_profiles"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "subject_requests"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome';
--> statement-breakpoint
ALTER TABLE "subjects"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "token_ledger"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome';
--> statement-breakpoint
ALTER TABLE "tutor_invite_tokens"
  ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "tutor_profiles"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "tutor_settings"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "tutor_subjects"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "tutor_weekday_availability"
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
ALTER TABLE "users"
  ALTER COLUMN "email_verified_at" SET DATA TYPE timestamp with time zone USING "email_verified_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'Europe/Rome',
  ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING CASE WHEN "updated_at" = "created_at" THEN "updated_at" AT TIME ZONE 'Europe/Rome' ELSE "updated_at" AT TIME ZONE 'UTC' END;
