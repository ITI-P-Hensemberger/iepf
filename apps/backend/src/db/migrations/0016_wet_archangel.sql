CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lesson_bookings_student_id_idx" ON "lesson_bookings" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "lessons_start_at_idx" ON "lessons" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "lessons_tutor_id_idx" ON "lessons" USING btree ("tutor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_unique" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "token_ledger_student_id_idx" ON "token_ledger" USING btree ("student_id");