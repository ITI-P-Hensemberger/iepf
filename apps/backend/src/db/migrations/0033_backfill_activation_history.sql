-- One "activated" event for every account active before the history existed. Written on
-- 2026-11-08 from production's audit logs and what the team knows: nobody had been deactivated
-- yet, so active accounts were activated once and pending ones never. Accounts that already have
-- an event, or that match none of the rules (other environments), are left alone.

-- Students: all activated by the only activator account. The profile's last update is the
-- activation (production's audit logs agree to the millisecond).
INSERT INTO "activation_events" ("id", "user_id", "kind", "actor_id", "actor_name", "actor_role", "created_at")
SELECT gen_random_uuid(), sp."user_id", 'activated', a."id", a."first_name" || ' ' || a."last_name", 'activator', sp."updated_at"
FROM "student_profiles" sp
CROSS JOIN (SELECT "id", "first_name", "last_name" FROM "users" WHERE "role" = 'activator') a
WHERE sp."is_active"
  AND (SELECT count(*) FROM "users" WHERE "role" = 'activator') = 1
  AND NOT EXISTS (SELECT 1 FROM "activation_events" e WHERE e."user_id" = sp."user_id");
--> statement-breakpoint

-- Tutors: active from sign-up on an invite sent by j.castiglioni.
INSERT INTO "activation_events" ("id", "user_id", "kind", "actor_id", "actor_name", "actor_role", "created_at")
SELECT gen_random_uuid(), tp."user_id", 'activated', i."id", i."first_name" || ' ' || i."last_name", 'admin', tp."created_at"
FROM "tutor_profiles" tp
JOIN "users" i ON i."email" = 'j.castiglioni@hensemberger.it'
WHERE tp."is_active"
  AND NOT EXISTS (SELECT 1 FROM "activation_events" e WHERE e."user_id" = tp."user_id");
--> statement-breakpoint

-- The setup admin: created active by the first installation, nobody activated it.
INSERT INTO "activation_events" ("id", "user_id", "kind", "actor_id", "actor_name", "actor_role", "created_at")
SELECT gen_random_uuid(), u."id", 'activated', NULL, 'Installazione iniziale', 'system', ap."created_at"
FROM "users" u
JOIN "admin_profiles" ap ON ap."user_id" = u."id"
WHERE u."email" = 'iepf@hensemberger.it' AND ap."is_active"
  AND NOT EXISTS (SELECT 1 FROM "activation_events" e WHERE e."user_id" = u."id");
--> statement-breakpoint

-- j.castiglioni: invited and activated by the setup admin. The activation predates the audit
-- logs: the registration is the closest known date (his later profile update was an edit).
INSERT INTO "activation_events" ("id", "user_id", "kind", "actor_id", "actor_name", "actor_role", "created_at")
SELECT gen_random_uuid(), u."id", 'activated', s."id", s."first_name" || ' ' || s."last_name", 'admin', ap."created_at"
FROM "users" u
JOIN "admin_profiles" ap ON ap."user_id" = u."id"
JOIN "users" s ON s."email" = 'iepf@hensemberger.it'
WHERE u."email" = 'j.castiglioni@hensemberger.it' AND ap."is_active"
  AND NOT EXISTS (SELECT 1 FROM "activation_events" e WHERE e."user_id" = u."id");
--> statement-breakpoint

-- The other admins: activated by j.castiglioni, on the profile's last update (2026-09-23 in the
-- audit logs).
INSERT INTO "activation_events" ("id", "user_id", "kind", "actor_id", "actor_name", "actor_role", "created_at")
SELECT gen_random_uuid(), ap."user_id", 'activated', i."id", i."first_name" || ' ' || i."last_name", 'admin', ap."updated_at"
FROM "admin_profiles" ap
JOIN "users" u ON u."id" = ap."user_id"
JOIN "users" i ON i."email" = 'j.castiglioni@hensemberger.it'
WHERE ap."is_active"
  AND u."email" NOT IN ('iepf@hensemberger.it', 'j.castiglioni@hensemberger.it')
  AND NOT EXISTS (SELECT 1 FROM "activation_events" e WHERE e."user_id" = ap."user_id");
