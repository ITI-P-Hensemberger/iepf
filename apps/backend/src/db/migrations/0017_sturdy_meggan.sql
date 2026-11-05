CREATE TABLE "reminder_deliveries" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
