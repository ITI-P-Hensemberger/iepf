CREATE TYPE "public"."activation_event_kind" AS ENUM('activated', 'deactivated', 'reactivated');--> statement-breakpoint
CREATE TABLE "activation_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "activation_event_kind" NOT NULL,
	"reason" text,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activation_events_user_idx" ON "activation_events" USING btree ("user_id","created_at");