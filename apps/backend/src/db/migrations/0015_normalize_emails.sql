-- Addresses that differ only by case stay untouched: which account survives is a manual choice.
UPDATE "users" AS u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS other
    WHERE other."id" <> u."id" AND lower(other."email") = lower(u."email")
  );--> statement-breakpoint
UPDATE "admin_invite_tokens" SET "email" = lower("email") WHERE "email" <> lower("email");--> statement-breakpoint
UPDATE "tutor_invite_tokens" SET "email" = lower("email") WHERE "email" <> lower("email");
