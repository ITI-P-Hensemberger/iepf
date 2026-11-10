CREATE TABLE "lesson_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lesson_messages" ADD CONSTRAINT "lesson_messages_booking_id_lesson_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."lesson_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_messages" ADD CONSTRAINT "lesson_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_messages_booking_created_idx" ON "lesson_messages" USING btree ("booking_id","created_at","id");--> statement-breakpoint
-- A new chat message wakes the other person's notification stream, as a new notification does:
-- the page then reloads the chat and its unread counts. Same channel and payload (a user id).
CREATE FUNCTION "lesson_messages_notify_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	target uuid;
BEGIN
	FOR target IN
		SELECT DISTINCT CASE WHEN m."sender_id" = b."student_id" THEN l."tutor_id" ELSE b."student_id" END
		FROM changed m
		JOIN "lesson_bookings" b ON b."id" = m."booking_id"
		JOIN "lessons" l ON l."id" = b."lesson_id"
	LOOP
		PERFORM pg_notify('iepf_notifications', target::text);
	END LOOP;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "lesson_messages_notify_insert" AFTER INSERT ON "lesson_messages"
REFERENCING NEW TABLE AS changed
FOR EACH STATEMENT EXECUTE FUNCTION "lesson_messages_notify_insert"();
