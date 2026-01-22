ALTER TABLE IF EXISTS "lessons" DROP CONSTRAINT IF EXISTS "lessons_availability_id_tutor_availability_id_fk";--> statement-breakpoint
ALTER TABLE IF EXISTS "lessons" DROP COLUMN IF EXISTS "availability_id";--> statement-breakpoint
ALTER TABLE IF EXISTS "tutor_availability" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "tutor_availability";
