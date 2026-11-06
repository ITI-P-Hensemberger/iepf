CREATE TABLE "analytics_daily" (
	"day" date NOT NULL,
	"event" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"year" integer DEFAULT 0 NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "analytics_daily_day_event_detail_role_year_pk" PRIMARY KEY("day","event","detail","role","year")
);
