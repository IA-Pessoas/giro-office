CREATE SCHEMA IF NOT EXISTS security;

CREATE TABLE security.rate_limit_buckets (
    bucket_key TEXT NOT NULL PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    hits INTEGER NOT NULL CHECK (hits > 0)
);
