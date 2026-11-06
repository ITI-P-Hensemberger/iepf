-- 'completed' was never set by the app; a lesson that took place stays 'confirmed'.
UPDATE "lessons" SET "status" = 'confirmed' WHERE "status" = 'completed';--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "subject_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "subject_from_booking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every booking so far was made for its lesson's subject.
ALTER TABLE "lesson_bookings" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
UPDATE "lesson_bookings" AS b SET "subject_id" = l."subject_id" FROM "lessons" AS l WHERE l."id" = b."lesson_id";--> statement-breakpoint
ALTER TABLE "lesson_bookings" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson_bookings" ADD CONSTRAINT "lesson_bookings_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Upcoming generated lessons were one per subject: fold each tutor's time slot into one lesson.
UPDATE "lessons" SET "subject_from_booking" = true
WHERE "generated_by_job" = true AND "start_at" > now() AND "status" <> 'canceled';--> statement-breakpoint
CREATE TEMP TABLE "lesson_slot_merge" AS
WITH "slot_lessons" AS (
  SELECT l."id", l."tutor_id", l."start_at",
    EXISTS (SELECT 1 FROM "lesson_bookings" AS b WHERE b."lesson_id" = l."id" AND b."status" = 'confirmed') AS "booked"
  FROM "lessons" AS l
  WHERE l."subject_from_booking" = true
), "ranked" AS (
  SELECT "id", "booked",
    first_value("id") OVER (PARTITION BY "tutor_id", "start_at" ORDER BY "booked" DESC, "id") AS "keeper"
  FROM "slot_lessons"
)
-- A lesson with confirmed bookings always stays; the others move into the slot's kept lesson.
SELECT "id", "keeper" FROM "ranked" WHERE NOT "booked" AND "id" <> "keeper";--> statement-breakpoint
UPDATE "lesson_bookings" AS b SET "lesson_id" = m."keeper" FROM "lesson_slot_merge" AS m WHERE b."lesson_id" = m."id";--> statement-breakpoint
UPDATE "token_ledger" AS t SET "lesson_id" = m."keeper" FROM "lesson_slot_merge" AS m WHERE t."lesson_id" = m."id";--> statement-breakpoint
UPDATE "lesson_feedback" AS f SET "lesson_id" = m."keeper" FROM "lesson_slot_merge" AS m WHERE f."lesson_id" = m."id";--> statement-breakpoint
DELETE FROM "lessons" WHERE "id" IN (SELECT "id" FROM "lesson_slot_merge");--> statement-breakpoint
DROP TABLE "lesson_slot_merge";--> statement-breakpoint
-- A kept lesson nobody holds a seat in is open again for any of the tutor's subjects.
UPDATE "lessons" AS l SET "subject_id" = NULL, "status" = 'scheduled'
WHERE l."subject_from_booking" = true
  AND NOT EXISTS (SELECT 1 FROM "lesson_bookings" AS b WHERE b."lesson_id" = l."id" AND b."status" = 'confirmed');
