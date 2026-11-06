CREATE TABLE "lesson_feedback_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"feedback_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"text" text,
	"editor_user_id" uuid,
	"editor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "lesson_feedback_booking_author_unique";--> statement-breakpoint
ALTER TABLE "lesson_feedback" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_feedback" ADD COLUMN "deleted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "lesson_feedback_versions" ADD CONSTRAINT "lesson_feedback_versions_feedback_id_lesson_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."lesson_feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_feedback_versions" ADD CONSTRAINT "lesson_feedback_versions_editor_user_id_users_id_fk" FOREIGN KEY ("editor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_feedback_versions_feedback_idx" ON "lesson_feedback_versions" USING btree ("feedback_id","created_at");--> statement-breakpoint
ALTER TABLE "lesson_feedback" ADD CONSTRAINT "lesson_feedback_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_feedback_booking_author_unique" ON "lesson_feedback" USING btree ("booking_id","author_user_id","author_role") WHERE "lesson_feedback"."deleted_at" is null;--> statement-breakpoint
-- Every feedback written so far starts its history with one version: its current state, by its author.
INSERT INTO "lesson_feedback_versions" ("id", "feedback_id", "rating", "text", "editor_user_id", "editor_role", "created_at")
SELECT gen_random_uuid(), "id", "rating", "text", "author_user_id", "author_role", "created_at" FROM "lesson_feedback";
