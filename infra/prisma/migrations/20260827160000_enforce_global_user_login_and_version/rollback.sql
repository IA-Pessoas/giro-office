-- Run manually only with application writers stopped. Keep `version` to avoid discarding
-- concurrency history; the prior application version safely ignores this additive column.
DROP INDEX IF EXISTS "users_login_key";
