ALTER TABLE "student_profiles" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD COLUMN "deactivation_reason" text;