-- Tells the backend whose unread count changed, whichever process wrote the rows: the API,
-- or a scheduled job running in its own container. One message per user and statement;
-- PostgreSQL delivers them on commit and drops the duplicates of a transaction.
CREATE FUNCTION "notifications_notify_changed"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	target uuid;
BEGIN
	FOR target IN SELECT DISTINCT "user_id" FROM changed LOOP
		PERFORM pg_notify('iepf_notifications', target::text);
	END LOOP;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "notifications_notify_insert" AFTER INSERT ON "notifications"
REFERENCING NEW TABLE AS changed
FOR EACH STATEMENT EXECUTE FUNCTION "notifications_notify_changed"();
--> statement-breakpoint
CREATE TRIGGER "notifications_notify_update" AFTER UPDATE ON "notifications"
REFERENCING NEW TABLE AS changed
FOR EACH STATEMENT EXECUTE FUNCTION "notifications_notify_changed"();
--> statement-breakpoint
CREATE TRIGGER "notifications_notify_delete" AFTER DELETE ON "notifications"
REFERENCING OLD TABLE AS changed
FOR EACH STATEMENT EXECUTE FUNCTION "notifications_notify_changed"();
