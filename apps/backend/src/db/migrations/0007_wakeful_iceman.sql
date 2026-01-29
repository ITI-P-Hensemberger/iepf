CREATE TYPE "public"."weekday_start_time" AS ENUM('14:00', '15:00');--> statement-breakpoint
ALTER TABLE "tutor_weekday_availability" ADD COLUMN "start_time" "weekday_start_time";