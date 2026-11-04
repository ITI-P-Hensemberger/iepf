CREATE TABLE "lesson_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lesson_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"author_role" text NOT NULL,
	"rating" integer NOT NULL,
	"text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_feedback" ADD CONSTRAINT "lesson_feedback_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_feedback" ADD CONSTRAINT "lesson_feedback_booking_id_lesson_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."lesson_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_feedback" ADD CONSTRAINT "lesson_feedback_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_feedback" ADD CONSTRAINT "lesson_feedback_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_feedback_booking_author_unique" ON "lesson_feedback" USING btree ("booking_id","author_user_id","author_role");