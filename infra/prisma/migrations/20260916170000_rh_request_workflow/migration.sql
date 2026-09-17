CREATE TABLE "rh"."request_reads" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_reads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rh"."notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organization_id" UUID NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rh"."message_reads" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_rh_request_reads_scope" ON "rh"."request_reads"("organization_id", "request_id", "user_id");
CREATE INDEX "idx_rh_request_reads_user" ON "rh"."request_reads"("organization_id", "user_id", "read_at");
CREATE UNIQUE INDEX "uq_rh_notifications_event" ON "rh"."notifications"("organization_id", "user_id", "request_id", "event_key");
CREATE INDEX "idx_rh_notifications_user_state" ON "rh"."notifications"("organization_id", "user_id", "read", "created_at");
CREATE UNIQUE INDEX "uq_rh_message_reads_scope" ON "rh"."message_reads"("organization_id", "message_id", "user_id");
CREATE INDEX "idx_rh_message_reads_user" ON "rh"."message_reads"("organization_id", "user_id", "read_at");

ALTER TABLE "rh"."request_reads" ADD CONSTRAINT "request_reads_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "rh"."requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."request_reads" ADD CONSTRAINT "request_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."request_reads" ADD CONSTRAINT "request_reads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rh"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."notifications" ADD CONSTRAINT "notifications_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "rh"."requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."message_reads" ADD CONSTRAINT "message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "rh"."request_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."message_reads" ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rh"."message_reads" ADD CONSTRAINT "message_reads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
