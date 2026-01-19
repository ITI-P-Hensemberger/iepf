ALTER TABLE "admin_profiles" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT false NOT NULL;
