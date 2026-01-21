CREATE TABLE "admin_invite_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_invite_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_weekday_availability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tutor_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutor_profiles" DROP CONSTRAINT "tutor_profiles_section_id_class_sections_id_fk";
--> statement-breakpoint
ALTER TABLE "tutor_profiles" ALTER COLUMN "section_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ALTER COLUMN "year" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "generated_by_job" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "generated_for_week" timestamp;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_weekday_availability" ADD CONSTRAINT "tutor_weekday_availability_tutor_id_users_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_weekday_availability_tutor_weekday_unique" ON "tutor_weekday_availability" USING btree ("tutor_id","weekday");--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_section_id_class_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."class_sections"("id") ON DELETE restrict ON UPDATE no action;