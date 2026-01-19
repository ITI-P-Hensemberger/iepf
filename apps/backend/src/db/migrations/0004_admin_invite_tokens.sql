CREATE TABLE IF NOT EXISTS "admin_invite_tokens" (
  "id" uuid PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_invite_tokens_email_unique" ON "admin_invite_tokens" USING btree ("email");
